/* ============================================================================
   MIGRATION: Semantic Duplicate Detection
   ============================================================================
   
   FILE: supabase/migrations/20260120_semantic_deduplication.sql
   CREATED: 2026-01-20
   
   ============================================================================
   PURPOSE
   ============================================================================
   
   Detects when the same exam paper is uploaded in different formats (PDF vs
   images) by extracting paper metadata (exam type, year) via AI and using
   normalized question text for deduplication.
   
   WHY THIS EXISTS:
   ─────────────────────────────────────────────────────────────────────────────
   Users may upload:
   - Original PDF of TT1 2024
   - Scanned/photographed images of the same paper
   
   Byte-hash can't catch this. But the CONTENT is the same, so we need
   semantic-level deduplication to prevent duplicate questions from skewing
   prediction algorithms.
   
   HOW IT WORKS:
   ─────────────────────────────────────────────────────────────────────────────
   1. AI extracts exam_type (TT1/TT2/CAE/FINAL) and exam_year from paper header
   2. Worker checks if another resource with same metadata already exists
   3. If duplicate found, mark as PARTIAL with warning (don't waste tokens)
   4. Question text is normalized (lowercase, no punctuation) for matching
   
   RELATED FILES:
   ─────────────────────────────────────────────────────────────────────────────
   - trigger/tasks/process-questions.ts - Metadata extraction + dedup logic
   - app/dev-test/page.tsx - UI dropdowns and duplicate warnings
   
============================================================================ */

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. RESOURCE METADATA COLUMNS
-- ─────────────────────────────────────────────────────────────────────────────
-- Store AI-detected paper metadata for duplicate detection

ALTER TABLE public.resources 
ADD COLUMN IF NOT EXISTS detected_exam_type TEXT;

ALTER TABLE public.resources 
ADD COLUMN IF NOT EXISTS detected_exam_year TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. QUESTION NORMALIZED TEXT
-- ─────────────────────────────────────────────────────────────────────────────
-- Generated column for fast text matching (lowercase, alphanumeric only)
-- This allows us to detect "What is OOP?" matching "what is oop"

ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS normalized_text TEXT;

-- Update existing questions with normalized text
UPDATE public.questions 
SET normalized_text = lower(regexp_replace(text, '[^a-zA-Z0-9 ]', '', 'g'))
WHERE normalized_text IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. INDEXES FOR FAST LOOKUPS
-- ─────────────────────────────────────────────────────────────────────────────

-- Find papers with same exam metadata
CREATE INDEX IF NOT EXISTS idx_resources_exam_metadata 
ON public.resources(subject_id, detected_exam_type, detected_exam_year)
WHERE detected_exam_type IS NOT NULL;

-- Find duplicate questions by normalized text
CREATE INDEX IF NOT EXISTS idx_questions_normalized_text
ON public.questions(subject_id, normalized_text)
WHERE normalized_text IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. COMMENTS
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.resources.detected_exam_type IS 
  'AI-detected exam type (TT1, TT2, CAE, FINAL, etc.) for semantic deduplication';

COMMENT ON COLUMN public.resources.detected_exam_year IS 
  'AI-detected exam year (2023, 2024, etc.) for semantic deduplication';

COMMENT ON COLUMN public.questions.normalized_text IS 
  'Lowercase, alphanumeric-only version of question text for duplicate detection';

COMMIT;

/* ============================================================================
   ROLLBACK
   ============================================================================
   
   ALTER TABLE public.resources DROP COLUMN IF EXISTS detected_exam_type;
   ALTER TABLE public.resources DROP COLUMN IF EXISTS detected_exam_year;
   ALTER TABLE public.questions DROP COLUMN IF EXISTS normalized_text;
   DROP INDEX IF EXISTS idx_resources_exam_metadata;
   DROP INDEX IF EXISTS idx_questions_normalized_text;
   
============================================================================ */
