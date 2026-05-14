/* ============================================================================
   MIGRATION: Duplicate Prevention & Enhanced Resource Tracking
   ============================================================================
   
   FILE: supabase/migrations/20260119_duplicate_prevention.sql
   CREATED: 2026-01-19
   
   ============================================================================
   PURPOSE
   ============================================================================
   
   Prevents duplicate file uploads by storing SHA-256 content hashes.
   When a user tries to upload the same file twice for the same subject,
   the system will detect and block it before wasting AI processing tokens.
   
   WHY THIS EXISTS:
   ─────────────────────────────────────────────────────────────────────────────
   Users can accidentally upload the same question paper or assignment twice.
   This wastes:
   - AI processing tokens
   - Storage space
   - Creates duplicate questions
   
   HOW IT WORKS:
   ─────────────────────────────────────────────────────────────────────────────
   1. Upload API calculates SHA-256 hash of file content
   2. Checks if hash already exists for this subject
   3. If duplicate → Block with error message
   4. If new → Store hash and proceed
   
   TECHNICAL DETAILS:
   ─────────────────────────────────────────────────────────────────────────────
   - content_hash: SHA-256 hex string (64 chars)
   - file_size_bytes: For quick size-based filtering
   - Unique index on (subject_id, content_hash) - allows same file in different subjects
   - WHERE clause excludes FAILED resources from uniqueness check
   
   RELATED FILES:
   ─────────────────────────────────────────────────────────────────────────────
   - app/api/upload-document/route.ts - Hash calculation & duplicate check
   - app/dev-test/page.tsx - UI error handling for 409 response
   
============================================================================ */

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ADD NEW COLUMNS
-- ─────────────────────────────────────────────────────────────────────────────
-- content_hash: SHA-256 hash of file content for duplicate detection
-- file_size_bytes: Quick lookup without reprocessing file
-- warning_message: For PARTIAL status to explain what went wrong

ALTER TABLE public.resources 
ADD COLUMN IF NOT EXISTS content_hash TEXT;

ALTER TABLE public.resources 
ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;

ALTER TABLE public.resources 
ADD COLUMN IF NOT EXISTS warning_message TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.5. ADD NEW STATUS VALUES TO ENUM
-- ─────────────────────────────────────────────────────────────────────────────
-- The status column uses resource_status ENUM.
-- We must ALTER TYPE to add new values (PARTIAL).

-- Add PARTIAL status
-- Note: We wrap in a block but avoid using the new value in the same transaction
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PARTIAL' AND enumtypid = 'resource_status'::regtype) THEN
    ALTER TYPE resource_status ADD VALUE 'PARTIAL';
  END IF;
END $$;

-- Drop redundant CHECK constraint (Enum type handles valid values)
-- We do NOT re-add it to avoid 55P04 (unsafe use of new enum value in same transaction)
ALTER TABLE public.resources 
DROP CONSTRAINT IF EXISTS resources_status_check;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. UNIQUE CONSTRAINT
-- ─────────────────────────────────────────────────────────────────────────────
-- Prevents same file being uploaded twice to same subject
-- Only applies to non-NULL hashes and non-FAILED resources
-- This allows re-uploading a file if previous upload failed

CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_subject_hash 
ON public.resources(subject_id, content_hash) 
WHERE content_hash IS NOT NULL 
  AND status NOT IN ('FAILED');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. FAST LOOKUP INDEX
-- ─────────────────────────────────────────────────────────────────────────────
-- For quick duplicate checks across the system

CREATE INDEX IF NOT EXISTS idx_resources_content_hash 
ON public.resources(content_hash) 
WHERE content_hash IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. COMMENTS
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.resources.content_hash IS 
  'SHA-256 hash of file content for duplicate detection';

COMMENT ON COLUMN public.resources.file_size_bytes IS 
  'File size in bytes for quick filtering';

COMMENT ON COLUMN public.resources.warning_message IS 
  'Warning message for PARTIAL status (e.g., low topic match)';

/* ============================================================================
   ROLLBACK
   ============================================================================
   
   DROP INDEX IF EXISTS idx_resources_subject_hash;
   DROP INDEX IF EXISTS idx_resources_content_hash;
   ALTER TABLE public.resources DROP COLUMN IF EXISTS content_hash;
   ALTER TABLE public.resources DROP COLUMN IF EXISTS file_size_bytes;
   ALTER TABLE public.resources DROP COLUMN IF EXISTS warning_message;
   
============================================================================ */
