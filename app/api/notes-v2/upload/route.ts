/* ============================================================================
   FILE: app/api/notes-v2/upload/route.ts
   ============================================================================
   
   Notes Upload API v2 (Qdrant RAG System)
   
   Handles file upload for teacher notes:
   1. Validates file and metadata
   2. Uploads to Supabase Storage
   3. Creates qdrant_notes_metadata record
   4. Triggers background processing task
   
============================================================================ */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import crypto from 'crypto';
import { PDFDocument } from 'pdf-lib';
import { uploadToGoogleFileAPI } from '@/lib/extraction/ai';

// Max file size: 20MB
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_NOTES_PDF_PAGES = 150;

// Allowed MIME types — PDF only for MVP
// Users should convert PPT/PPTX to PDF before uploading
const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
]);

// File type mapping
const MIME_TO_TYPE: Record<string, string> = {
    'application/pdf': 'pdf',
};

/**
 * Calculate SHA-256 hash of file for deduplication
 */
async function calculateFileHash(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = crypto.createHash('sha256').update(Buffer.from(buffer)).digest();
    return hashBuffer.toString('hex');
}

/**
 * POST /api/notes-v2/upload
 * 
 * FormData:
 * - file: File (required)
 * - subject_id: string (required)
 * - college_id: string (required) - College name (will be looked up in colleges table)
 * - teacher_name: string (optional)
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();

        // 1. Verify authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // 2. Parse form data
        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const subjectId = formData.get('subject_id') as string | null;
        const collegeName = formData.get('college_id') as string | null; // Accept college name
        const teacherName = formData.get('teacher_name') as string | null;

        // 3. Validate required fields
        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 }
            );
        }

        if (!subjectId || !collegeName) {
            return NextResponse.json(
                { error: 'Missing required fields: subject_id and college_id' },
                { status: 400 }
            );
        }

        // 4. Look up college ID from colleges table
        const { data: college, error: collegeError } = await supabase
            .from('colleges')
            .select('id')
            .ilike('name', collegeName)
            .maybeSingle();

        // If college doesn't exist, create it
        let collegeId: string;
        if (!college) {
            const { data: newCollege, error: createError } = await supabase
                .from('colleges')
                .insert({ name: collegeName })
                .select('id')
                .single();

            if (createError || !newCollege) {
                console.error('[Upload] College creation error:', createError);
                return NextResponse.json(
                    { error: 'Failed to create college record' },
                    { status: 500 }
                );
            }
            collegeId = newCollege.id;
        } else {
            collegeId = college.id;
        }

        // 5. Validate file type
        if (!ALLOWED_MIME_TYPES.has(file.type)) {
            return NextResponse.json(
                { error: `Invalid file type. Only PDF is supported. Please convert your PPT/PPTX to PDF before uploading.` },
                { status: 400 }
            );
        }

        // 6. Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
                { status: 400 }
            );
        }

        // 7. Calculate file hash for deduplication
        const contentHash = await calculateFileHash(file);

        // 8. Check for duplicate (SAME user uploading SAME file twice)
        // Per-user dedup only - prevents accidental self-duplicates
        // Cross-user discovery/recommendation is handled separately
        const { data: existing } = await supabase
            .from('qdrant_notes_metadata')
            .select('id, original_filename, processing_status, storage_path')
            .eq('college_id', collegeId)
            .eq('subject_id', subjectId)
            .eq('uploader_id', user.id)  // ← Only check THIS user's uploads
            .eq('content_hash', contentHash)
            .is('deleted_at', null)
            .maybeSingle();

        if (existing) {
            if (existing.processing_status === 'FAILED') {
                // Cleanup failed upload so user can retry
                console.log('[Upload] Cleaning up failed upload:', existing.id);
                if (existing.storage_path) {
                    await supabase.storage.from('resources').remove([existing.storage_path]);
                }
                await supabase.from('qdrant_notes_metadata').delete().eq('id', existing.id);
                // Continue with fresh upload (don't return 409)
            } else {
                // User already uploaded this exact file
                return NextResponse.json(
                    {
                        error: 'Duplicate file',
                        message: `You have already uploaded this file: ${existing.original_filename}`,
                        existing_id: existing.id
                    },
                    { status: 409 }
                );
            }
        }

        // 9. Generate storage path
        const timestamp = Date.now();
        const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = `notes/${collegeId}/${subjectId}/${timestamp}_${sanitizedFilename}`;

        // 10. Parallel Upload to Supabase and Google File API
        const fileBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(fileBuffer);
        const pageCount = pdfDoc.getPageCount();

        if (pageCount > MAX_NOTES_PDF_PAGES) {
            return NextResponse.json(
                {
                    error: `PDF too long`,
                    message: `This PDF has ${pageCount} pages. Maximum allowed is ${MAX_NOTES_PDF_PAGES} pages. Please split the document or upload individual chapters.`
                },
                { status: 400 }
            );
        }

        const bufferForGoogle = Buffer.from(fileBuffer);
        
        const [supabaseResult, googleResult] = await Promise.allSettled([
            supabase.storage
                .from('resources')
                .upload(storagePath, fileBuffer, {
                    contentType: file.type,
                    upsert: false,
                }),
            uploadToGoogleFileAPI(bufferForGoogle, file.type, file.name)
        ]);

        if (supabaseResult.status === 'rejected' || supabaseResult.value.error) {
            const error = supabaseResult.status === 'rejected' ? supabaseResult.reason : supabaseResult.value.error;
            console.error('[Upload] Supabase storage error:', error);
            return NextResponse.json(
                { error: 'Failed to upload file to permanent storage', details: error?.message || String(error) },
                { status: 500 }
            );
        }

        // Google upload is optional - pass URI to trigger if it worked
        let googleFileUri: string | null = null;
        let googleFileName: string | null = null;
        
        if (googleResult.status === 'fulfilled') {
            googleFileUri = googleResult.value.uri;
            googleFileName = googleResult.value.name;
        } else {
            console.warn('[Upload] Google File API upload failed, trigger will use fallback:', googleResult.reason);
        }

        // 11. Create metadata record
        const { data: metadata, error: insertError } = await supabase
            .from('qdrant_notes_metadata')
            .insert({
                college_id: collegeId,
                subject_id: subjectId,
                uploader_id: user.id,
                original_filename: file.name,
                file_type: MIME_TO_TYPE[file.type] || 'unknown',
                teacher_name: teacherName,
                storage_path: storagePath,
                content_hash: contentHash,
                processing_status: 'PENDING',
                page_count: pageCount,
                qdrant_point_ids: [],  // Will be populated by processing task
            })
            .select('id')
            .single();

        if (insertError) {
            console.error('[Upload] Insert error:', insertError);
            // Cleanup: delete uploaded file
            await supabase.storage.from('resources').remove([storagePath]);
            return NextResponse.json(
                { error: 'Failed to create metadata record', details: insertError.message },
                { status: 500 }
            );
        }

        // 12. Trigger background processing task
        // Import dynamically to avoid issues with Trigger.dev in non-worker context
        let triggerRunId: string | null = null;
        try {
            const { tasks } = await import('@trigger.dev/sdk');
            const handle = await tasks.trigger('process-notes-qdrant', {
                metadataId: metadata.id,
                collegeId,
                subjectId,
                storagePath,
                googleFileUri,
                googleFileName,
                originalFilename: file.name,
                fileType: MIME_TO_TYPE[file.type],
                teacherName,
                pageCount,
            });
            triggerRunId = handle.id;
        } catch (triggerError) {
            console.error('[Upload] Failed to trigger processing task:', triggerError);
            // Don't fail the upload - mark as pending for manual retry
        }

        // 13. Return success
        return NextResponse.json({
            success: true,
            metadata_id: metadata.id,
            run_id: triggerRunId,        // ← Frontend uses this as job_id for polling
            message: 'File uploaded successfully. Processing started.',
        });

    } catch (error) {
        console.error('[Upload] Unexpected error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
