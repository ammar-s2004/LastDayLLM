/* ============================================================================
   FILE: app/api/upload-document/route.ts
   ============================================================================
   HARDENED VERSION - MVP PRODUCTION READY
   
   FIXES APPLIED:
   1. .maybeSingle() everywhere (prevents 500 on missing rows)
   2. Deterministic idempotency keys
   3. Observability logging
============================================================================ */

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@/lib/supabase-server";
import { tasks } from "@trigger.dev/sdk";
import { PDFDocument } from "pdf-lib";
import { splitIntoBatches, getModelForBatch, NOTES_TPM } from "@/lib/ai-limits";

export const runtime = "nodejs";

const genAI = new GoogleGenAI({
  apiKey: process.env.GOOGLE_AI_API_KEY!,
});

/* ======================================================
   CONSTANTS
====================================================== */

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);

// ─────────────────────────────────────────────────────────────────────────────
// SYLLABUS LIMITS (strict - syllabi should be concise)
// ─────────────────────────────────────────────────────────────────────────────
const SYLLABUS_MAX_FILE_SIZE = 5 * 1024 * 1024;   // 5MB per file
const SYLLABUS_MAX_BATCH_SIZE = 5 * 1024 * 1024;  // 5MB total (single file only)
const SYLLABUS_MAX_PDF_PAGES = 6;                 // 6 pages max
const SYLLABUS_MAX_IMAGES = 3;                    // 3 images max

// ─────────────────────────────────────────────────────────────────────────────
// QP/ASSIGNMENT LIMITS (stricter - abuse prevention)
// ─────────────────────────────────────────────────────────────────────────────
const QP_MAX_FILE_SIZE = 5 * 1024 * 1024;         // 5MB per file
const QP_MAX_BATCH_SIZE = 30 * 1024 * 1024;       // 30MB total
const QP_MAX_PDF_PAGES = 20;                      // 20 pages max
const QP_MAX_FILES_PER_BATCH = 10;                // 10 separate files max
const QP_MAX_IMAGES_SINGLE_PAPER = 6;             // 6 images if combining into 1

const ALLOWED_RESOURCE_TYPES = new Set([
  "SYLLABUS",
  "TEST_PAPER",
  "ASSIGNMENT",
]);

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Calculate SHA-256 hash for duplicate detection
// ─────────────────────────────────────────────────────────────────────────────
async function calculateFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ======================================================
   HELPERS
====================================================== */

async function getPdfPageCount(file: File): Promise<number> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    return pdfDoc.getPageCount();
  } catch (error) {
    throw new Error("Failed to read PDF file");
  }
}

async function uploadFileToGoogle(file: File, resourceType: string): Promise<
  | {
    success: true;
    data: {
      google_file_name: string;
      uri: string;
      mime_type: string;
      original_filename: string;
      size: number;
    };
  }
  | {
    success: false;
    error: string;
    filename: string;
  }
> {
  try {
    const result = await genAI.files.upload({
      file,
      config: {
        mimeType: file.type,
        displayName: `${resourceType}_${file.name}`,
      },
    });

    return {
      success: true as const,
      data: {
        google_file_name: result.name!,
        uri: result.uri!,
        mime_type: file.type,
        original_filename: file.name,
        size: file.size,
      },
    };
  } catch (error: any) {
    return {
      success: false as const,
      error: error.message || "Upload failed",
      filename: file.name,
    };
  }
}


/* ======================================================
   MAIN HANDLER
====================================================== */

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  let uploadedGoogleFiles: string[] = [];

  try {
    /* ---------- AUTHENTICATION ---------- */
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    /* ---------- EXTRACT FORM DATA ---------- */
    const formData = await req.formData();
    const files = formData.getAll("file") as File[];
    const subjectId = formData.get("subject_id") as string | null;
    const resourceType = formData.get("resource_type") as string | null;
    let isSinglePaper = formData.get("is_single_paper") === "true";

    // User-tagged paper metadata (Layer 1 defense for duplicate detection)
    const userExamType = formData.get("exam_type") as string | null;
    const userExamYear = formData.get("exam_year") as string | null;
    const isSyllabus = resourceType?.toUpperCase() === "SYLLABUS";

    // ✅ Sync: Allow multiple images for syllabus (treat as one resource)
    if (isSyllabus && files.length > 1) {
      isSinglePaper = true;
    }

    if (!files || files.length === 0 || !subjectId || !resourceType) {
      console.error("[UPLOAD 400] Missing fields", { fileCount: files?.length, subjectId, resourceType });
      return NextResponse.json(
        { error: "Missing required fields: file(s), subject_id, resource_type" },
        { status: 400 }
      );
    }

    const normalizedResourceType = resourceType.toUpperCase();

    if (!ALLOWED_RESOURCE_TYPES.has(normalizedResourceType)) {
      console.error("[UPLOAD 400] Invalid resource type", { resourceType: normalizedResourceType });
      return NextResponse.json(
        { error: "Invalid resource_type" },
        { status: 400 }
      );
    }

    /* ---------- FIX 1: SUBJECT OWNERSHIP CHECK (.maybeSingle) ---------- */
    const { data: subject, error: ownershipError } = await supabase
      .from("subjects")
      .select("id")
      .eq("id", subjectId)
      .eq("user_id", user.id)
      .maybeSingle(); // FIX 1: Changed from .single()

    if (ownershipError || !subject) {
      console.error("[UPLOAD 403] Subject not found or access denied", { subjectId, userId: user.id });
      return NextResponse.json(
        { error: "Subject not found or access denied" },
        { status: 403 }
      );
    }

    /* ---------- 1. FILE VALIDATION & HASHING ---------- */
    const invalidFiles: Array<{ filename: string; reason: string }> = [];
    const filePageCounts: Map<number, number> = new Map();
    const fileHashes: Map<File, string> = new Map();
    let totalSize = 0;

    const MAX_FILE_SIZE = isSyllabus ? SYLLABUS_MAX_FILE_SIZE : QP_MAX_FILE_SIZE;
    const MAX_BATCH_SIZE = isSyllabus ? SYLLABUS_MAX_BATCH_SIZE : QP_MAX_BATCH_SIZE;
    const MAX_PDF_PAGES = isSyllabus ? SYLLABUS_MAX_PDF_PAGES : QP_MAX_PDF_PAGES;
    const MAX_IMAGES = isSyllabus ? SYLLABUS_MAX_IMAGES : QP_MAX_IMAGES_SINGLE_PAPER;
    const MAX_FILES = isSyllabus ? SYLLABUS_MAX_IMAGES : QP_MAX_FILES_PER_BATCH;

    // Reject immediate syllabus invalid state
    if (isSyllabus && isSinglePaper && files.length === 1) {
      // Just a single file, isSinglePaper=true is redundant but harmless
    }

    for (const file of files) {
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        invalidFiles.push({ filename: file.name, reason: "Unsupported file type (use PNG, JPEG, WebP, or PDF)" });
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        invalidFiles.push({ filename: file.name, reason: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB, max ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB)` });
        continue;
      }
      if (file.type === "application/pdf") {
        try {
          const pageCount = await getPdfPageCount(file);
          filePageCounts.set(files.indexOf(file), pageCount);
          if (pageCount > MAX_PDF_PAGES) {
            invalidFiles.push({ filename: file.name, reason: `PDF has ${pageCount} pages (max ${MAX_PDF_PAGES})` });
          }
        } catch (error) {
          invalidFiles.push({ filename: file.name, reason: "Could not read PDF file" });
        }
      } else {
        filePageCounts.set(files.indexOf(file), 1);
      }
      totalSize += file.size;

      // Calculate hash
      const hash = await calculateFileHash(file);
      fileHashes.set(file, hash);
    }

    if (invalidFiles.length > 0) {
      console.error("[UPLOAD 400] Invalid files", { invalidFiles });
      return NextResponse.json({ error: "Some files are invalid", invalidFiles }, { status: 400 });
    }
    if (totalSize > MAX_BATCH_SIZE) {
      console.error("[UPLOAD 400] Batch too large", { totalSize, limit: MAX_BATCH_SIZE });
      return NextResponse.json({ error: `Total batch size exceeds ${(MAX_BATCH_SIZE / 1024 / 1024).toFixed(1)}MB limit` }, { status: 400 });
    }

    /* ---------- 2. DEDUPLICATION (Against DB & Batch) ---------- */
    const uniqueFilesToUpload: File[] = [];
    const duplicates: any[] = [];
    const seenHashes = new Set<string>();

    for (const file of files) {
      const hash = fileHashes.get(file)!;

      // Check in-batch
      if (seenHashes.has(hash)) {
        duplicates.push({ filename: file.name, reason: "Duplicate in selection" });
        continue;
      }
      seenHashes.add(hash);

      // Check against DB (only non-failed)
      const { data: existing } = await supabase
        .from("resources")
        .select("id, original_filename, status")
        .eq("subject_id", subjectId)
        .eq("content_hash", hash)
        .limit(1)
        .maybeSingle();

      if (existing) {
        if (existing.status === 'FAILED') {
          // Cleanup failed upload so we can retry
          console.log("Cleanup failed upload:", existing.id);
          await supabase.from("resources").delete().eq("id", existing.id);
          uniqueFilesToUpload.push(file);
        } else {
          duplicates.push({
            filename: file.name,
            reason: `Already exists as "${existing.original_filename}"`
          });
        }
      } else {
        uniqueFilesToUpload.push(file);
      }
    }

    // Special check for Syllabus existence (if uploading a new but non-duplicate one)
    if (isSyllabus && uniqueFilesToUpload.length > 0) {
      const { data: existingSyllabus } = await supabase
        .from("resources")
        .select("id")
        .eq("subject_id", subjectId)
        .eq("resource_type", "SYLLABUS")
        .neq("status", "FAILED")
        .limit(1)
        .maybeSingle();

      if (existingSyllabus) {
        console.error("[UPLOAD 409] Syllabus exists", { subjectId });
        return NextResponse.json({
          error: "Syllabus already exists for this subject.",
          code: "SYLLABUS_EXISTS",
        }, { status: 409 });
      }
    }

    if (uniqueFilesToUpload.length === 0 && duplicates.length > 0) {
      return NextResponse.json({
        success: false,
        code: 'DUPLICATE_FILES',
        duplicates
      }, { status: 409 });
    }

    /* ---------- HARD PREREQUISITE: SYLLABUS + SCOPE ---------- */
    if (normalizedResourceType === "TEST_PAPER" || normalizedResourceType === "ASSIGNMENT") {
      const { data: existingTopics } = await supabase
        .from("topics")
        .select("id")
        .eq("subject_id", subjectId)
        .limit(1);

      if (!existingTopics || existingTopics.length === 0) {
        console.error("[UPLOAD 400] Syllabus required", { subjectId });
        return NextResponse.json(
          {
            error: "No syllabus found for this subject. Please upload syllabus first.",
            code: "SYLLABUS_REQUIRED",
          },
          { status: 400 }
        );
      }

      const { data: existingScopes } = await supabase
        .from("exam_scopes")
        .select("id")
        .eq("subject_id", subjectId)
        .eq("user_id", user.id)
        .limit(1);

      if (!existingScopes || existingScopes.length === 0) {
        console.error("[UPLOAD 400] Scope required", { subjectId });
        return NextResponse.json(
          {
            error: "No exam scope configured for this subject. Please configure exam scope before uploading questions.",
            code: "SCOPE_REQUIRED",
            redirect: `/subjects/${subjectId}/prepare`,
          },
          { status: 400 }
        );
      }
    }

    /* ---------- 3. CAPACITY CHECK ---------- */
    const { data: currentLimits } = await supabase
      .from("subject_resource_limits")
      .select("syllabus_count, test_paper_count, assignment_count")
      .eq("subject_id", subjectId)
      .maybeSingle();

    let currentCount = 0;
    let limit = 0;

    switch (normalizedResourceType) {
      case "SYLLABUS":
        currentCount = currentLimits?.syllabus_count || 0;
        limit = 1;
        break;
      case "TEST_PAPER":
        currentCount = currentLimits?.test_paper_count || 0;
        limit = 10;
        break;
      case "ASSIGNMENT":
        currentCount = currentLimits?.assignment_count || 0;
        limit = 8;
        break;
    }

    const resourcesBeingCreated = isSinglePaper ? 1 : uniqueFilesToUpload.length;
    const remainingSlots = limit - currentCount;

    // SYLLABUS: Allow replacing a FAILED syllabus by skipping the 429 check if it's the only one 
    // and the immutability check (above) already cleared us.
    if (normalizedResourceType !== "SYLLABUS" && resourcesBeingCreated > remainingSlots) {
      console.error("[UPLOAD 429] Capacity exceeded", { resourcesBeingCreated, remainingSlots, limit });
      return NextResponse.json(
        {
          error: `Not enough capacity. You have ${remainingSlots} slots remaining but are trying to upload ${resourcesBeingCreated} ${resourceType.toLowerCase()}(s).`,
          code: "CAPACITY_EXCEEDED",
        },
        { status: 429 }
      );
    }

    /* ---------- 4. UPLOAD UNIQUE FILES TO GOOGLE ---------- */
    const uploadPromises = uniqueFilesToUpload.map(file =>
      uploadFileToGoogle(file, normalizedResourceType)
    );

    const uploadResults = await Promise.allSettled(uploadPromises);

    const succeeded: Array<{
      google_file_name: string;
      uri: string;
      mime_type: string;
      original_filename: string;
      size: number;
      content_hash: string;
    }> = [];

    const failed: Array<{ filename: string; error: string }> = [];

    uploadResults.forEach((result, index) => {
      const originalFile = uniqueFilesToUpload[index];
      const hash = fileHashes.get(originalFile) || '';

      if (result.status === "fulfilled" && result.value.success) {
        succeeded.push({ ...result.value.data, content_hash: hash });
      } else if (result.status === "fulfilled" && !result.value.success) {
        failed.push({ filename: uniqueFilesToUpload[index].name, error: result.value.error });
      } else {
        failed.push({
          filename: uniqueFilesToUpload[index].name,
          error: result.status === "rejected" ? result.reason?.message || "Unknown error" : "Unknown error",
        });
      }
    });

    uploadedGoogleFiles = succeeded.map(f => f.google_file_name);

    if (succeeded.length === 0) {
      return NextResponse.json(
        {
          error: "All file uploads failed",
          failures: failed,
        },
        { status: 500 }
      );
    }

    /* ---------- CREATE RESOURCE RECORDS ---------- */
    const batchId = succeeded.length > 1 || isSinglePaper
      ? `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      : null;

    let resourceInserts;

    if (isSinglePaper) {
      // For single paper (multiple images = 1 resource), use first file's hash
      resourceInserts = [{
        subject_id: subjectId,
        uploaded_by: user.id,
        resource_type: normalizedResourceType,
        file_url: succeeded[0].uri,
        status: "UPLOADING" as const,
        content_hash: succeeded[0].content_hash,
        file_size_bytes: succeeded.reduce((sum, f) => sum + f.size, 0),
        meta: {
          files: succeeded,
          is_multi_page: true,
          page_count: succeeded.length,
          upload_type: "single_paper",
          batch_id: batchId,
        },
      }];
    } else {
      resourceInserts = succeeded.map((file, index) => ({
        subject_id: subjectId,
        uploaded_by: user.id,
        resource_type: normalizedResourceType,
        file_url: file.uri,
        status: "UPLOADING" as const,
        content_hash: file.content_hash,
        file_size_bytes: file.size,
        meta: {
          google_file_name: file.google_file_name,
          mime_type: file.mime_type,
          original_filename: file.original_filename,
          size: file.size,
          upload_type: succeeded.length > 1 ? "batch" : "single",
          ...(succeeded.length > 1 && {
            batch_id: batchId,
            batch_size: succeeded.length,
            batch_position: index + 1,
          }),
        },
      }));
    }

    // NO SECOND DEDUPLICATION NEEDED - We already filtered uniqueFilesToUpload at step 2.
    const finalInserts = resourceInserts;
    const allDuplicates = duplicates; // Collected at step 2


    // 4. Insert only new records
    let resources: any[] = [];
    if (finalInserts.length > 0) {
      const { data, error: insertError } = await supabase
        .from("resources")
        .insert(finalInserts) // standard insert
        .select("id, meta");

      if (insertError) {
        console.error("Supabase Insert Error:", JSON.stringify(insertError, null, 2));
        throw new Error("Failed to create resource records");
      }
      resources = data || [];
    }

    // Safety check: if insert returned nothing but we expected results
    if (resources.length === 0 && finalInserts.length > 0) {
      console.error("Insert returned no data despite having inserts");
      throw new Error("Failed to create resource records - no data returned");
    }

    /* ---------- INCREMENT RESOURCE COUNTER ---------- */
    await supabase.rpc("increment_subject_resource_count", {
      p_subject_id: subjectId,
      p_resource_type: normalizedResourceType,
      p_increment_by: resources.length,
    });


    /* ---------- TRIGGER BACKGROUND TASK ---------- */
    // Only trigger if we actually created new resources
    if (resources.length > 0) {
      if (normalizedResourceType === "SYLLABUS") {
        const resource = resources[0];
        const file = succeeded[0];

        await tasks.trigger(
          "process-syllabus",
          {
            resourceId: resource.id,
            fileUri: file.uri,
            googleFileName: file.google_file_name,
            mimeType: file.mime_type,
            documentType: normalizedResourceType,
            subjectId,
            files: isSinglePaper ? succeeded.map(f => ({
              uri: f.uri,
              googleFileName: f.google_file_name,
              mimeType: f.mime_type,
            })) : undefined,
          },
          {
            idempotencyKey: `resource-${resource.id}`,
          }
        );
      } else {
        // Get scoped topics from junction table (union of all exam types)
        const { data: scopedTopics } = await supabase
          .from("exam_scope_topics")
          .select("topic_id, exam_scopes!inner(subject_id, user_id)")
          .eq("exam_scopes.subject_id", subjectId)
          .eq("exam_scopes.user_id", user.id);

        if (!scopedTopics || scopedTopics.length === 0) {
          console.error("[UPLOAD 400] Scope empty", { subjectId });
          return NextResponse.json(
            {
              error: "No topics in exam scope. Please configure exam scope with topics.",
              code: "SCOPE_EMPTY",
              redirect: `/subjects/${subjectId}/prepare`,
            },
            { status: 400 }
          );
        }

        // Extract unique topic IDs (union across all exam types)
        const allowedTopicIds = Array.from(
          new Set(scopedTopics.map(st => st.topic_id))
        );

        // Build file info with page counts for token estimation
        const filesWithPageCounts = succeeded.map((file, originalIndex) => ({
          file,
          resourceIndex: isSinglePaper ? 0 : originalIndex,
          mimeType: file.mime_type,
          pageCount: filePageCounts.get(originalIndex) || 1,
        }));

        // TEST_PAPER and ASSIGNMENT use the Notes/Questions TPM limit
        const tpmLimit = NOTES_TPM;

        // Split into token-safe batches
        const batches = splitIntoBatches(
          filesWithPageCounts.map(f => ({ mimeType: f.mimeType, pageCount: f.pageCount })),
          tpmLimit
        );

        console.log("TOKEN BATCHING", {
          totalFiles: succeeded.length,
          batchCount: batches.length,
          batchSizes: batches.map(b => b.length),
        });

        // Trigger a job for each batch
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batchFileIndexes = batches[batchIndex];
          const batchFiles = batchFileIndexes.map(idx => filesWithPageCounts[idx]);

          const filePayload = batchFiles.map(({ file, resourceIndex }) => ({
            fileUri: file.uri,
            googleFileName: file.google_file_name,
            mimeType: file.mime_type,
            originalFilename: file.original_filename,
            resourceId: resources[resourceIndex].id,
          }));

          // Deterministic idempotency key per batch
          const batchIdempotencyKey = batches.length > 1
            ? `${batchId || 'batch'}-chunk-${batchIndex}-${filePayload.map(f => f.resourceId).join("-")}`
            : batchId || `resource-${resources.map(r => r.id).join("-")}`;

          // Model selection based on resource type
          const preferredModel = getModelForBatch(normalizedResourceType, batchIndex);

          const triggerResult = await tasks.trigger(
            "process-questions",
            {
              subjectId,
              resourceType: normalizedResourceType,
              files: filePayload,
              allowedTopicIds,
              preferredModel,
              // User-tagged metadata (Layer 1 defense - overrides AI detection)
              userExamType: userExamType || undefined,
              userExamYear: userExamYear || undefined,
            },
            {
              idempotencyKey: batchIdempotencyKey,
            }
          );

          // Store the actual Trigger.dev run ID for progress tracking
          // This is what the worker uses as job_id in job_progress table
          if (batchIndex === 0) {
            // For first batch, use its run ID as the main job_id
            (resources as any)._triggerJobId = triggerResult.id;
          }
        }
      }

    } // End if (resources.length > 0)

    /* ---------- FIX 3: OBSERVABILITY LOG ---------- */
    console.log("UPLOAD COMPLETE", {
      subjectId,
      resourceType: normalizedResourceType,
      resources: resources.map(r => r.id),
      batchId,
      filesUploaded: succeeded.length,
      filesFailed: failed.length,
    });

    /* ---------- SUCCESS RESPONSE ---------- */
    return NextResponse.json({
      success: true,
      uploaded: succeeded.length,
      failed: failed.length,
      resource_ids: resources.map(r => r.id),
      resources_created: resources.length,
      batch_id: batchId,
      job_id: (resources as any)._triggerJobId || null,  // Actual Trigger.dev run ID
      ...(failed.length > 0 && { failures: failed }),
      duplicates: allDuplicates || [],
      message: (failed.length > 0)
        ? `${succeeded.length} uploaded, ${failed.length} failed.`
        : (resources.length < succeeded.length)
          ? `${resources.length} uploaded, ${succeeded.length - resources.length} duplicates skipped.`
          : `${succeeded.length} files uploaded successfully.`,
    });

  } catch (err: any) {
    console.error("Upload error:", err);

    await Promise.all(
      uploadedGoogleFiles.map(name =>
        genAI.files.delete({ name }).catch(() => { })
      )
    );

    return NextResponse.json(
      { error: err.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
