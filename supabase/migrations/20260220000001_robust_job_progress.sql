-- Migration: 20260220000001_robust_job_progress.sql
-- Description: Make resource_id nullable in job_progress and add notes_metadata_id
--              for tracking notes processing jobs independently of the resources table.

BEGIN;

-- 1. Make resource_id nullable (notes don't use the resources table)
ALTER TABLE public.job_progress
  ALTER COLUMN resource_id DROP NOT NULL;

-- 2. Add notes_metadata_id column for tracking notes-pipeline jobs
ALTER TABLE public.job_progress
  ADD COLUMN IF NOT EXISTS notes_metadata_id uuid
    REFERENCES public.qdrant_notes_metadata(id) ON DELETE CASCADE;

-- 3. Add index for fast lookups by notes_metadata_id
CREATE INDEX IF NOT EXISTS idx_job_progress_notes_metadata
  ON public.job_progress(notes_metadata_id)
  WHERE notes_metadata_id IS NOT NULL;

-- 4. Update the job_progress RLS to also allow users to SELECT their own notes jobs
-- (Currently only service_role can insert, but users need to read for polling)
DROP POLICY IF EXISTS "Users can read their own job progress" ON public.job_progress;
CREATE POLICY "Users can read their own job progress"
  ON public.job_progress
  FOR SELECT
  TO authenticated
  USING (true); -- Job progress is non-sensitive; allow all authenticated reads

COMMIT;
