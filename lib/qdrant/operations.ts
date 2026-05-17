/* ============================================================================
   FILE: lib/qdrant/operations.ts
   ============================================================================
   
   Qdrant CRUD Operations for Notes RAG System
   
   - Upsert: Store note chunks with embeddings
   - Search: Similarity search for RAG
   - Delete: Remove by upload_id or expired
   - Discovery: List available notes by college
   
============================================================================ */

// QdrantClient removed as it was unused
import { getQdrantClient, NOTES_COLLECTION, initializeCollection } from './client';
import type {
    UpsertChunkInput,
    NoteSearchFilters,
    NoteSearchResult,
    NoteDiscoveryItem,
    NoteChunkPayload,
    QdrantStorageStats,
} from './types';

/* ======================================================
   UPSERT OPERATIONS
====================================================== */

/**
 * Upsert note chunks to Qdrant
 * @param chunks Array of chunks with embeddings and payloads
 */
export async function upsertNoteChunks(chunks: UpsertChunkInput[]): Promise<void> {
    if (chunks.length === 0) return;

    // Ensure collection exists
    await initializeCollection();

    const client = getQdrantClient();

    // Qdrant expects points in this format
    const points = chunks.map(chunk => ({
        id: chunk.id,
        vector: chunk.vector,
        payload: chunk.payload as unknown as Record<string, unknown>,
    }));

    // Upsert in batches of 100 for safety
    const BATCH_SIZE = 100;
    for (let i = 0; i < points.length; i += BATCH_SIZE) {
        const batch = points.slice(i, i + BATCH_SIZE);

        // DEBUG: Log the exact first point being sent
        if (batch.length > 0) {
            const sample = batch[0];
            console.log('[Qdrant] DEBUG - First point in batch:', {
                id: sample.id,
                idType: typeof sample.id,
                vectorLength: sample.vector?.length,
                vectorType: typeof sample.vector,
                vectorIsArray: Array.isArray(sample.vector),
                vectorSample: sample.vector?.slice(0, 5),
                vectorHasNaN: sample.vector?.some((v: number) => isNaN(v)),
                vectorHasInfinity: sample.vector?.some((v: number) => !isFinite(v)),
                payloadKeys: Object.keys(sample.payload || {}),
                payload: sample.payload,
            });
        }

        try {
            await client.upsert(NOTES_COLLECTION, {
                wait: true,
                points: batch,
            });
        } catch (error: any) {
            console.error(`[Qdrant] Upsert failed for batch starting at ${i}:`, {
                status: error?.status,
                message: error?.message,
                details: error?.response?.data || error?.data || error?.body || JSON.stringify(error),
            });
            throw error;
        }
    }


    console.log(`[Qdrant] Upserted ${chunks.length} chunks`);
}

/* ======================================================
   SEARCH OPERATIONS
====================================================== */

/**
 * Search for relevant note chunks using vector similarity
 * @param queryVector Embedding vector for the query
 * @param filters Optional filters for college, subject, etc.
 * @param limit Max results to return
 */
export async function searchNotes(
    queryVector: number[],
    filters: NoteSearchFilters = {},
    limit: number = 10
): Promise<NoteSearchResult[]> {
    const client = getQdrantClient();

    // Build filter conditions using Qdrant's filter format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mustConditions: any[] = [];

    if (filters.college_id) {
        mustConditions.push({
            key: 'college_id',
            match: { value: filters.college_id },
        });
    }

    if (filters.subject_id) {
        mustConditions.push({
            key: 'subject_id',
            match: { value: filters.subject_id },
        });
    }

    if (filters.teacher_name) {
        mustConditions.push({
            key: 'teacher_name',
            match: { value: filters.teacher_name },
        });
    }

    if (filters.content_type) {
        mustConditions.push({
            key: 'content_type',
            match: { value: filters.content_type },
        });
    }

    if (filters.chunk_tier) {
        mustConditions.push({
            key: 'chunk_tier',
            match: { value: filters.chunk_tier },
        });
    }

    // Build the filter object
    const filter = mustConditions.length > 0 ? { must: mustConditions } : undefined;

    const searchResult = await client.search(NOTES_COLLECTION, {
        vector: queryVector,
        limit,
        filter,
        with_payload: true,
    });

    return searchResult.map(result => ({
        id: String(result.id),
        score: result.score,
        payload: result.payload as unknown as NoteChunkPayload,
    }));
}

/* ======================================================
   HYBRID SEARCH (topic-filtered vector search)
====================================================== */

/**
 * Detect which syllabus topics are relevant to a question using free keyword matching.
 * Matches substrings case-insensitively. Returns the exact topic strings from the allowlist.
 *
 * @param question - The student's question
 * @param syllabusTopics - Array of exact syllabus topic names for this subject
 */
export function detectTopicsFromQuestion(
    question: string,
    syllabusTopics: string[]
): string[] {
    const q = question.toLowerCase();
    return syllabusTopics.filter(topic => q.includes(topic.toLowerCase()));
}

/**
 * Hybrid RAG search:
 * 1. Detect syllabus topics from the question (free keyword match)
 * 2. If topics detected → filtered Qdrant vector search on matched_syllabus_topics
 * 3. If no topics detected → fallback to standard unfiltered vector search
 *
 * @param queryVector - Embedding for the question
 * @param filters - Standard search filters (college_id, subject_id, etc.)
 * @param syllabusTopics - The subject's full syllabus topic list (for detection)
 * @param question - The raw question string (used for topic detection)
 * @param limit - Max results
 */
export async function searchNotesHybrid(
    queryVector: number[],
    filters: NoteSearchFilters,
    syllabusTopics: string[],
    question: string,
    limit: number = 10
): Promise<{ results: NoteSearchResult[]; detectedTopics: string[] }> {
    const detectedTopics = detectTopicsFromQuestion(question, syllabusTopics);

    if (detectedTopics.length > 0) {
        const client = getQdrantClient();

        // Build base must conditions (college, subject, teacher, etc.)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mustConditions: any[] = [];

        if (filters.college_id) {
            mustConditions.push({ key: 'college_id', match: { value: filters.college_id } });
        }
        if (filters.subject_id) {
            mustConditions.push({ key: 'subject_id', match: { value: filters.subject_id } });
        }
        if (filters.teacher_name) {
            mustConditions.push({ key: 'teacher_name', match: { value: filters.teacher_name } });
        }
        if (filters.chunk_tier) {
            mustConditions.push({ key: 'chunk_tier', match: { value: filters.chunk_tier } });
        }

        // The core topic filter — MatchAny across the detected topics (lowercased for case-insensitivity)
        mustConditions.push({
            key: 'matched_syllabus_topics',
            match: { any: detectedTopics.map(t => t.toLowerCase()) },
        });

        const searchResult = await client.search(NOTES_COLLECTION, {
            vector: queryVector,
            limit,
            filter: { must: mustConditions },
            with_payload: true,
        });

        const results = searchResult.map(r => ({
            id: String(r.id),
            score: r.score,
            payload: r.payload as unknown as NoteChunkPayload,
        }));

        // Fallback: if the topic filter is too narrow and returns nothing, widen the search
        if (results.length === 0) {
            console.log('[Qdrant] Topic filter returned 0 results, falling back to unfiltered search');
            const fallback = await searchNotes(queryVector, filters, limit);
            return { results: fallback, detectedTopics };
        }

        return { results, detectedTopics };
    }

    // No topics detected — use standard unfiltered search
    const results = await searchNotes(queryVector, filters, limit);
    return { results, detectedTopics: [] };
}


/* ======================================================
   DELETE OPERATIONS
====================================================== */

/**
 * Delete all chunks for a specific upload
 * @param uploadId The upload_id from qdrant_notes_metadata
 */
export async function deleteByUploadId(uploadId: string): Promise<number> {
    const client = getQdrantClient();

    const result = await client.delete(NOTES_COLLECTION, {
        wait: true,
        filter: {
            must: [{
                key: 'upload_id',
                match: { value: uploadId },
            }],
        },
    });

    console.log(`[Qdrant] Deleted chunks for upload: ${uploadId}`);
    return result.status === 'completed' ? 1 : 0;
}

/**
 * Delete all expired notes
 * @returns Number of points deleted
 */
export async function deleteExpiredNotes(): Promise<number> {
    const client = getQdrantClient();
    const now = new Date().toISOString();

    // First, count how many will be deleted
    const countResult = await client.count(NOTES_COLLECTION, {
        filter: {
            must: [{
                key: 'expires_at',
                range: { lt: now },
            }],
        },
        exact: true,
    });

    if (countResult.count === 0) {
        console.log('[Qdrant] No expired notes to delete');
        return 0;
    }

    // Delete expired points
    await client.delete(NOTES_COLLECTION, {
        wait: true,
        filter: {
            must: [{
                key: 'expires_at',
                range: { lt: now },
            }],
        },
    });

    console.log(`[Qdrant] Deleted ${countResult.count} expired points`);
    return countResult.count;
}

/* ======================================================
   DISCOVERY OPERATIONS
====================================================== */

/**
 * Get unique notes available for a college (for discovery UI)
 * Returns metadata only, no content
 */
export async function getCollegeNotes(collegeId: string): Promise<NoteDiscoveryItem[]> {
    const client = getQdrantClient();

    // Scroll through all points for this college
    // Group by upload_id to get unique files
    const scrollResult = await client.scroll(NOTES_COLLECTION, {
        filter: {
            must: [{
                key: 'college_id',
                match: { value: collegeId },
            }],
        },
        limit: 1000,
        with_payload: true,
    });

    // Group by upload_id
    const uploadsMap = new Map<string, NoteDiscoveryItem>();

    for (const point of scrollResult.points) {
        const payload = point.payload as unknown as NoteChunkPayload;
        const uploadId = payload.upload_id;

        if (!uploadsMap.has(uploadId)) {
            uploadsMap.set(uploadId, {
                upload_id: uploadId,
                filename: payload.filename,
                file_type: payload.file_type,
                teacher_name: payload.teacher_name,
                subject_name: payload.subject_name,
                chunk_count: 1,
                created_at: payload.created_at,
            });
        } else {
            // Increment chunk count
            const existing = uploadsMap.get(uploadId)!;
            existing.chunk_count++;
        }
    }

    return Array.from(uploadsMap.values());
}

/* ======================================================
   STATS & MONITORING
====================================================== */

/**
 * Get storage statistics for monitoring
 */
export async function getStorageStats(): Promise<QdrantStorageStats> {
    const client = getQdrantClient();

    const collectionInfo = await client.getCollection(NOTES_COLLECTION);
    const pointsCount = collectionInfo.points_count || 0;

    // Scroll to count unique colleges and subjects
    const scrollResult = await client.scroll(NOTES_COLLECTION, {
        limit: 10000,
        with_payload: ['college_id', 'subject_id'],
    });

    const colleges = new Set<string>();
    const subjects = new Set<string>();

    for (const point of scrollResult.points) {
        const payload = point.payload as Record<string, unknown>;
        if (payload.college_id) colleges.add(String(payload.college_id));
        if (payload.subject_id) subjects.add(String(payload.subject_id));
    }

    // Rough estimate: ~4KB per point (768 floats * 4 bytes + payload)
    const estimatedSizeMb = (pointsCount * 4) / 1024;

    return {
        total_points: pointsCount,
        colleges_count: colleges.size,
        subjects_count: subjects.size,
        estimated_size_mb: Math.round(estimatedSizeMb * 100) / 100,
    };
}

/**
 * Check if notes exist for a college + subject combination
 */
export async function hasExistingNotes(
    collegeId: string,
    subjectId: string
): Promise<{ exists: boolean; count: number }> {
    const client = getQdrantClient();

    const countResult = await client.count(NOTES_COLLECTION, {
        filter: {
            must: [
                { key: 'college_id', match: { value: collegeId } },
                { key: 'subject_id', match: { value: subjectId } },
            ],
        },
        exact: true,
    });

    return {
        exists: countResult.count > 0,
        count: countResult.count,
    };
}
