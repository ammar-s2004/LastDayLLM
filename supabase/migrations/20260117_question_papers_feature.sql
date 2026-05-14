-- ============================================================
-- MIGRATION: Question Papers Feature (Complete)
-- Created: 2026-01-17
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────
-- 1. Unique constraint on questions (required for upsert)
-- ─────────────────────────────────────────────────────────
ALTER TABLE public.questions 
DROP CONSTRAINT IF EXISTS questions_resource_question_unique;

ALTER TABLE public.questions 
ADD CONSTRAINT questions_resource_question_unique 
UNIQUE (resource_id, question_no);

-- ─────────────────────────────────────────────────────────
-- 2. Unique constraint on job_progress (required for upsert)
-- ─────────────────────────────────────────────────────────
ALTER TABLE public.job_progress 
DROP CONSTRAINT IF EXISTS job_progress_job_stage_unique;

ALTER TABLE public.job_progress 
ADD CONSTRAINT job_progress_job_stage_unique 
UNIQUE (job_id, stage);

-- ─────────────────────────────────────────────────────────
-- 3. View for capacity checking
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.subject_resource_limits AS
SELECT 
  subject_id,
  COUNT(*) FILTER (WHERE resource_type = 'SYLLABUS' AND status != 'FAILED') as syllabus_count,
  COUNT(*) FILTER (WHERE resource_type = 'TEST_PAPER' AND status != 'FAILED') as test_paper_count,
  COUNT(*) FILTER (WHERE resource_type = 'ASSIGNMENT' AND status != 'FAILED') as assignment_count
FROM public.resources
GROUP BY subject_id;

-- ─────────────────────────────────────────────────────────
-- 4. No-op RPC (route calls this, view handles counting)
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_subject_resource_count(
  p_subject_id UUID,
  p_resource_type TEXT,
  p_increment_by INTEGER DEFAULT 1
)
RETURNS VOID 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
BEGIN 
  RETURN; -- No-op, view auto-calculates
END; 
$$;

GRANT EXECUTE ON FUNCTION public.increment_subject_resource_count TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 5. Performance indexes (CRITICAL - don't skip these)
-- ─────────────────────────────────────────────────────────

-- Question lookups (used by process-questions task)
CREATE INDEX IF NOT EXISTS idx_questions_resource 
ON public.questions(resource_id);

-- Topic linking (used by process-questions task)
CREATE INDEX IF NOT EXISTS idx_question_topics_topic 
ON public.question_topics(topic_id);

-- Job progress queries (used by UI to show progress)
CREATE INDEX IF NOT EXISTS idx_job_progress_resource 
ON public.job_progress(resource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_progress_job 
ON public.job_progress(job_id, created_at DESC);

-- Resource status filtering (upload API checks this)
CREATE INDEX IF NOT EXISTS idx_resources_status_active 
ON public.resources(status) 
WHERE status IN ('UPLOADING', 'PROCESSING');

-- Exam scope topic lookups (upload API queries this junction table)
CREATE INDEX IF NOT EXISTS idx_exam_scope_topics_scope 
ON public.exam_scope_topics(exam_scope_id);

CREATE INDEX IF NOT EXISTS idx_exam_scope_topics_topic 
ON public.exam_scope_topics(topic_id);

COMMIT;
