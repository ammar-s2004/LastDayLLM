/* ============================================================================
   FILE: trigger/tasks/process-notes-qdrant.ts
   ============================================================================

   Background Task: Process Notes for Qdrant RAG (Notes Intel Pipeline)

   Pipeline:
   1. Download file from Supabase Storage (if no pre-uploaded Google URI)
   2. Upload to Google File API (fallback if URI not provided at trigger time)
   3. Extract notes intel in one Gemini call
   4. Map concept_intel + verbatim + diagrams -> Qdrant payload
   5. Generate embeddings via Google Embeddings API
   6. Upsert chunks to Qdrant
   7. Compute NC scores + topic map and upsert to Supabase
   8. Smart deduplication, update Supabase metadata

============================================================================ */

import { task, logger, metadata } from '@trigger.dev/sdk';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

import { generateBatchEmbeddings } from '@/lib/embeddings';
import { extractNotesIntel, uploadToGoogleFileAPI, deleteGoogleFile } from '@/lib/extraction/ai';
import type { NotesIntelResult } from '@/lib/extraction/notes-intel';
import type { SyllabusHierarchy } from '@/lib/ai-prompts';
import { computeNCFileScores, computeFileWeight } from '@/lib/nc';
import { upsertNoteChunks, deleteByUploadId } from '@/lib/qdrant';
import type { UpsertChunkInput, NoteChunkPayload } from '@/lib/qdrant';

export function estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
}

/* ======================================================
   CONFIGURATION
====================================================== */

function getSupabaseAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );
}

/* ======================================================
   HELPERS
====================================================== */

async function downloadFile(storagePath: string): Promise<Buffer> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.storage
        .from('resources')
        .download(storagePath);

    if (error || !data) {
        throw new Error(`Failed to download file: ${JSON.stringify(error) || 'Unknown error'}`);
    }

    return Buffer.from(await data.arrayBuffer());
}

async function updateMetadata(
    metadataId: string,
    updates: {
        processing_status?: string;
        error_message?: string;
        chunk_count?: number;
        total_tokens?: number;
        qdrant_point_ids?: string[];
        is_best_collection?: boolean;
        expires_at?: string | null;
        doc_summary?: string | null;
        key_topics?: string[];
        page_count?: number;
    }
) {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
        .from('qdrant_notes_metadata')
        .update(updates)
        .eq('id', metadataId);

    if (error) {
        logger.error('[updateMetadata] DB update failed', { error });
        throw new Error(`Failed to update metadata: ${error.message}`);
    }

    logger.info('[updateMetadata] Updated metadata', { id: metadataId, status: updates.processing_status });
}

async function updateProgress(
    metadataId: string,
    jobId: string,
    stage: string,
    progress: number,
    message: string
) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
        .from('job_progress')
        .upsert(
            {
                job_id: jobId,
                notes_metadata_id: metadataId,
                stage,
                progress,
                message,
            },
            { onConflict: 'job_id,stage' }
        );

    if (error) {
        logger.warn('[updateProgress] DB write failed (non-fatal)', { error: error.message });
    }
}

async function getContextNames(collegeId: string, subjectId: string, metadataId: string) {
    const supabase = getSupabaseAdmin();

    const [collegeResult, subjectResult, metaResult] = await Promise.all([
        supabase.from('colleges').select('name').eq('id', collegeId).single(),
        supabase.from('subjects').select('name').eq('id', subjectId).single(),
        supabase.from('qdrant_notes_metadata').select('uploader_id').eq('id', metadataId).single(),
    ]);

    return {
        collegeName: collegeResult.data?.name || 'Unknown',
        subjectName: subjectResult.data?.name || 'Unknown',
        uploaderUserId: metaResult.data?.uploader_id || '',
    };
}

async function getSubjectHierarchy(
    subjectId: string,
    supabase: any
): Promise<SyllabusHierarchy[]> {
    const { data: modules } = await supabase
        .from('modules')
        .select('id, module_no, title')
        .eq('subject_id', subjectId)
        .order('module_no');

    const { data: topics } = await supabase
        .from('topics')
        .select('id, name, module_id, sub_topics, parent_topic_id')
        .eq('subject_id', subjectId)
        .order('topic_no');

    return (modules ?? []).map((mod: any) => {
        const parentTopics = (topics ?? [])
            .filter((t: any) => t.module_id === mod.id && t.parent_topic_id === null)
            .map((t: any) => ({
                name: t.name,
                sub_topics: (t.sub_topics ?? []) as string[],
            }));

        return {
            module_no: mod.module_no,
            module_title: mod.title,
            topics: parentTopics,
        };
    });
}

function normalizeTopicName(value: string): string {
    return value.trim().toLocaleLowerCase();
}

/* ======================================================
   SMART DEDUPLICATION
====================================================== */

async function handleDeduplication(
    collegeId: string,
    subjectId: string,
    newUploadId: string,
    newChunkCount: number
): Promise<{ isBest: boolean; expiresAt: string | null }> {
    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
        .from('qdrant_notes_metadata')
        .select('id, chunk_count')
        .eq('college_id', collegeId)
        .eq('subject_id', subjectId)
        .eq('is_best_collection', true)
        .is('deleted_at', null)
        .neq('id', newUploadId)
        .single();

    if (!existing) {
        return { isBest: true, expiresAt: null };
    }

    if (newChunkCount > existing.chunk_count) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 2);

        await supabase
            .from('qdrant_notes_metadata')
            .update({
                is_best_collection: false,
                expires_at: expiryDate.toISOString(),
            })
            .eq('id', existing.id);

        return { isBest: true, expiresAt: null };
    } else {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 2);

        return { isBest: false, expiresAt: expiryDate.toISOString() };
    }
}

/* ======================================================
   MAIN TASK
====================================================== */

export const processNotesQdrantTask = task({
    id: 'process-notes-qdrant',

    retry: {
        maxAttempts: 3,
        factor: 2,
        minTimeoutInMs: 5000,
        maxTimeoutInMs: 60000,
    },

    run: async (payload: {
        metadataId: string;
        collegeId: string;
        subjectId: string;
        storagePath: string;
        googleFileUri?: string | null;
        googleFileName?: string | null;
        originalFilename: string;
        fileType: string;
        teacherName: string | null;
        pageCount: number;
    }, { ctx }) => {
        const {
            metadataId,
            collegeId,
            subjectId,
            storagePath,
            googleFileUri: payloadFileUri,
            googleFileName: payloadFileName,
            originalFilename,
            fileType,
            teacherName,
            pageCount,
        } = payload;

        const jobId = ctx.run.id;

        logger.info('[Process] Starting', { filename: originalFilename, jobId });
        metadata.set('status', 'starting').set('filename', originalFilename).set('jobId', jobId);

        let buffer: Buffer | null = null;
        let resolvedFileUri: string = payloadFileUri ?? '';
        let fallbackFileName: string | null = null;
        let isSuccess = false;

        try {
            await updateMetadata(metadataId, { processing_status: 'PROCESSING' });
            await updateProgress(metadataId, jobId, 'init', 5, 'Initializing...');

            const mimeType = 'application/pdf';

            if (!payloadFileUri) {
                logger.info('[Process] Downloading file');
                metadata.set('status', 'downloading').set('progress', 10);
                await updateProgress(metadataId, jobId, 'download', 10, 'Downloading file...');
                buffer = await downloadFile(storagePath);
            }

            if (!resolvedFileUri) {
                logger.info('[Process] Uploading fallback to Google');
                metadata.set('status', 'uploading_to_google').set('progress', 15);
                await updateProgress(metadataId, jobId, 'upload', 15, 'Uploading document to Google GenAI...');
                const uploaded = await uploadToGoogleFileAPI(buffer!, mimeType, originalFilename);
                resolvedFileUri = uploaded.uri;
                fallbackFileName = uploaded.name;
            }

            logger.info('[Process] Extracting notes intel with AI');
            metadata.set('status', 'condensing').set('progress', 30);
            await updateProgress(metadataId, jobId, 'condensing', 30, 'AI processing document into notes intel...');

            const hierarchy = await getSubjectHierarchy(subjectId, getSupabaseAdmin());

            let notesIntelResult: NotesIntelResult;
            try {
                notesIntelResult = await extractNotesIntel(
                    resolvedFileUri,
                    mimeType,
                    hierarchy,
                    originalFilename,
                    pageCount
                );
            } catch (err) {
                throw new Error(`AI notes intel extraction failed: ${err instanceof Error ? err.message : String(err)}`);
            }

            const { topic_map, topic_coverage, concept_intel, verbatim, diagrams } = notesIntelResult;

            const totalChunks = concept_intel.length + verbatim.length + diagrams.length;
            if (totalChunks === 0) {
                throw new Error('Notes intel extraction produced zero chunks and cannot proceed.');
            }

            logger.info('[Process] Chunks created', {
                conceptIntelCount: concept_intel.length,
                verbatimCount: verbatim.length,
                diagramCount: diagrams.length,
            });
            metadata.set('chunkCount', totalChunks).set('progress', 60);
            await updateProgress(
                metadataId,
                jobId,
                'chunking',
                60,
                `Created ${concept_intel.length} concept intel, ${verbatim.length} verbatim, and ${diagrams.length} diagram chunks`
            );

            await updateProgress(metadataId, jobId, 'mapping', 70, 'Mapping chunks to Qdrant points...');
            const { collegeName, subjectName, uploaderUserId } = await getContextNames(collegeId, subjectId, metadataId);
            const now = new Date().toISOString();
            const keyTopics = topic_map.map((topic) => topic.topic);

            const allPoints: Array<{ content: string; payload: NoteChunkPayload }> = [];
            let chunkIndex = 0;

            for (const item of concept_intel) {
                allPoints.push({
                    content: item.intel,
                    payload: {
                        upload_id: metadataId,
                        chunk_index: chunkIndex++,
                        college_id: collegeId,
                        college_name: collegeName,
                        subject_id: subjectId,
                        subject_name: subjectName,
                        filename: originalFilename,
                        file_type: fileType,
                        teacher_name: teacherName ?? null,
                        content: item.intel,
                        chunk_tier: 'concept_intel',
                        matched_syllabus_topics: item.subtopic ? [item.topic, item.subtopic] : [item.topic],
                        source_page_range: item.page_range || undefined,
                        subtopic: item.subtopic || undefined,
                        topic_tags: item.subtopic ? [item.topic, item.subtopic] : [item.topic],
                        key_topics: keyTopics,
                        uploader_id: uploaderUserId,
                        created_at: now,
                    }
                });
            }

            for (const item of verbatim) {
                allPoints.push({
                    content: item.content,
                    payload: {
                        upload_id: metadataId,
                        chunk_index: chunkIndex++,
                        college_id: collegeId,
                        college_name: collegeName,
                        subject_id: subjectId,
                        subject_name: subjectName,
                        filename: originalFilename,
                        file_type: fileType,
                        teacher_name: teacherName ?? null,
                        content: item.content,
                        chunk_tier: 'verbatim',
                        verbatim_type: item.type,
                        matched_syllabus_topics: item.subtopic ? [item.topic, item.subtopic] : [item.topic],
                        label: item.label || undefined,
                        page: item.page || undefined,
                        topic_tags: item.subtopic ? [item.topic, item.subtopic] : [item.topic],
                        key_topics: keyTopics,
                        uploader_id: uploaderUserId,
                        created_at: now,
                    }
                });
            }

            for (const item of diagrams) {
                allPoints.push({
                    content: item.description,
                    payload: {
                        upload_id: metadataId,
                        chunk_index: chunkIndex++,
                        college_id: collegeId,
                        college_name: collegeName,
                        subject_id: subjectId,
                        subject_name: subjectName,
                        filename: originalFilename,
                        file_type: fileType,
                        teacher_name: teacherName ?? null,
                        content: item.description,
                        chunk_tier: 'diagram',
                        matched_syllabus_topics: item.subtopic ? [item.topic, item.subtopic] : [item.topic],
                        page: item.page || undefined,
                        topic_tags: item.subtopic ? [item.topic, item.subtopic] : [item.topic],
                        key_topics: keyTopics,
                        uploader_id: uploaderUserId,
                        created_at: now,
                    }
                });
            }

            metadata.set('status', 'embeddings').set('progress', 75);
            await updateProgress(metadataId, jobId, 'embedding', 75, `Generating embeddings for ${totalChunks} chunks...`);

            const contents = allPoints.map((point) => point.content);
            const embeddings = await generateBatchEmbeddings(contents);

            const qdrantPoints: UpsertChunkInput[] = allPoints.map((point, index) => ({
                id: crypto.randomUUID(),
                vector: embeddings[index],
                payload: point.payload,
            }));

            logger.info('[Process] Uploading to Qdrant');
            metadata.set('status', 'uploading').set('progress', 85);
            await updateProgress(metadataId, jobId, 'upsert', 85, 'Saving to vector database...');
            await upsertNoteChunks(qdrantPoints);

            const supabase = getSupabaseAdmin();
            const { data: topicRows, error: topicsError } = await supabase
                .from('topics')
                .select('id, name, module_id, parent_topic_id')
                .eq('subject_id', subjectId);

            if (topicsError) {
                throw new Error(`Failed to fetch topics for NC computation: ${topicsError.message}`);
            }

            const topicLookup = new Map(
                (topicRows ?? []).map((topic: { id: string; name: string; module_id: string | null; parent_topic_id: string | null }) => [
                    normalizeTopicName(topic.name),
                    topic,
                ])
            );

            // Build child map: parentId to child rows for direct subtopic NC scoring.
            const childrenByParent = new Map<string, Array<{ id: string; module_id: string | null; name: string }>>();
            for (const topic of (topicRows ?? []) as { id: string; name: string; module_id: string | null; parent_topic_id: string | null }[]) {
                if (topic.parent_topic_id) {
                    const existing = childrenByParent.get(topic.parent_topic_id) ?? [];
                    existing.push({ id: topic.id, module_id: topic.module_id, name: topic.name });
                    childrenByParent.set(topic.parent_topic_id, existing);
                }
            }

            const ncFileResults = computeNCFileScores(topic_coverage);
            const fileWeight = computeFileWeight(pageCount);

            const ncScoreRows = ncFileResults.flatMap((result) => {
                const matchedTopic = topicLookup.get(normalizeTopicName(result.topic));
                if (!matchedTopic) {
                    logger.warn('[Process] Could not resolve topic for nc_scores row, skipping', {
                        topic: result.topic,
                    });
                    return [];
                }

                const children = childrenByParent.get(matchedTopic.id);
                if (children && children.length > 0) {
                    const matchedChild = children.find(
                        (child) => normalizeTopicName(child.name) === normalizeTopicName(result.subtopic)
                    );

                    if (!matchedChild) {
                        logger.warn('[Process] Could not resolve subtopic for nc_scores row, skipping', {
                            topic: result.topic,
                            subtopic: result.subtopic,
                        });
                        return [];
                    }

                    return [{
                        subject_id: subjectId,
                        module_id: matchedChild.module_id,
                        topic_id: matchedChild.id,
                        note_file_id: metadataId,
                        nc_file_score: result.nc_file_score,
                        file_weight: fileWeight,
                        depth_breakdown: result.depth_breakdown,
                    }];
                }

                // Leaf topic (no children) — write directly
                return [{
                    subject_id: subjectId,
                    module_id: matchedTopic.module_id,
                    topic_id: matchedTopic.id,
                    note_file_id: metadataId,
                    nc_file_score: result.nc_file_score,
                    file_weight: fileWeight,
                    depth_breakdown: result.depth_breakdown,
                }];
            });

            if (ncScoreRows.length > 0) {
                const { error: ncScoresError } = await supabase
                    .from('nc_scores')
                    .upsert(ncScoreRows, { onConflict: 'topic_id,note_file_id' });

                if (ncScoresError) {
                    throw new Error(`Failed to upsert nc_scores: ${ncScoresError.message}`);
                }
            }

            const ncTopicMapRows = topic_map.flatMap((entry) => {
                const matchedTopic = topicLookup.get(normalizeTopicName(entry.topic));
                if (!matchedTopic) {
                    logger.warn('[Process] Could not resolve topic for nc_topic_map row, skipping', {
                        topic: entry.topic,
                    });
                    return [];
                }

                return [{
                    subject_id: subjectId,
                    module_id: matchedTopic.module_id,
                    topic_id: matchedTopic.id,
                    note_file_id: metadataId,
                    subtopics_covered: entry.subtopics_covered,
                    not_covered: entry.not_covered,
                }];
            });

            if (ncTopicMapRows.length > 0) {
                const { error: ncTopicMapError } = await supabase
                    .from('nc_topic_map')
                    .upsert(ncTopicMapRows, { onConflict: 'topic_id,note_file_id' });

                if (ncTopicMapError) {
                    throw new Error(`Failed to upsert nc_topic_map: ${ncTopicMapError.message}`);
                }
            }

            logger.info('[Process] Running deduplication');
            metadata.set('status', 'deduplication').set('progress', 95);
            const { isBest, expiresAt } = await handleDeduplication(
                collegeId,
                subjectId,
                metadataId,
                totalChunks
            );

            const totalTokens = contents.reduce((sum, text) => sum + estimateTokenCount(text), 0);

            await updateMetadata(metadataId, {
                processing_status: 'COMPLETED',
                chunk_count: totalChunks,
                total_tokens: totalTokens,
                qdrant_point_ids: qdrantPoints.map((point) => point.id),
                doc_summary: null,
                key_topics: keyTopics,
                is_best_collection: isBest,
                expires_at: expiresAt,
                page_count: pageCount,
            });

            logger.info('[Process] Complete', { chunks: totalChunks, isBest });
            metadata.set('status', 'completed').set('progress', 100);
            await updateProgress(
                metadataId,
                jobId,
                'completed',
                100,
                isBest ? 'Done! Best collection saved.' : 'Done! Processing complete.'
            );

            isSuccess = true;
            return {
                success: true,
                chunkCount: totalChunks,
                totalTokens,
                isBestCollection: isBest,
            };

        } catch (error) {
            const isLastAttempt = ctx.attempt.number >= (ctx.run.maxAttempts ?? 1);
            logger.error('[Process] Error:', {
                error: error instanceof Error ? error.message : String(error),
                attempt: ctx.attempt.number,
                isLastAttempt,
                storagePath
            });

            metadata.set('status', 'failed').set('progress', 0);
            await updateProgress(
                metadataId,
                jobId,
                'failed',
                0,
                `Failed: ${error instanceof Error ? error.message.slice(0, 100) : 'Unknown error'}`
            );

            if (isLastAttempt) {
                try {
                    await updateMetadata(metadataId, {
                        processing_status: 'FAILED',
                        error_message: error instanceof Error ? error.message : String(error),
                    });
                    logger.info('[Process] Updated metadata to FAILED status (final attempt)');
                } catch (metadataErr) {
                    logger.error('[Process] CRITICAL: Failed to update metadata to FAILED', { error: metadataErr });
                }

                try {
                    const supabase = getSupabaseAdmin();
                    const { error: deleteError } = await supabase.storage
                        .from('resources')
                        .remove([storagePath]);

                    if (deleteError) {
                        logger.error('[Process] Storage cleanup error', { error: deleteError });
                    } else {
                        logger.info('[Process] Cleaned up storage file after final failure');
                    }
                } catch (cleanupErr) {
                    logger.error('[Process] CRITICAL: Storage cleanup exception', { error: cleanupErr });
                }

                await deleteByUploadId(metadataId).catch(() => {});
            } else {
                logger.info('[Process] Skipping cleanup/failure marking for retry', {
                    nextAttempt: ctx.attempt.number + 1
                });
            }

            throw error;
        } finally {
            const isLastAttempt = ctx.attempt.number >= (ctx.run.maxAttempts ?? 1);

            if (isSuccess || isLastAttempt) {
                if (payloadFileName) {
                    await deleteGoogleFile(payloadFileName).catch(() => {});
                }
            }

            if (fallbackFileName) {
                await deleteGoogleFile(fallbackFileName).catch(() => {});
            }
        }
    },
});
