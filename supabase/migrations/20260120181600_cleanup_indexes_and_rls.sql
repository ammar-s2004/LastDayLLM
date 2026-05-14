/* ============================================================================
   MIGRATION: Database Cleanup - Duplicate Indexes & RLS Performance
   ============================================================================
   
   FILE: supabase/migrations/20260120181600_cleanup_indexes_and_rls.sql
   CREATED: 2026-01-20
   
   ============================================================================
   PURPOSE
   ============================================================================
   
   1. DUPLICATE INDEXES: Remove redundant indexes that waste storage and slow writes.
   2. RLS PERFORMANCE: Replace `auth.uid()` with `(SELECT auth.uid())` in policies
      to prevent per-row re-evaluation.
   
   ============================================================================
   ROLLBACK PLAN
   ============================================================================
   
   If issues arise, recreate dropped indexes:
   
   CREATE INDEX idx_job_progress_job_id ON public.job_progress(job_id, created_at DESC);
   CREATE INDEX subjects_user_id_idx ON public.subjects(user_id);
   CREATE INDEX topics_module_id_idx ON public.topics(module_id);
   CREATE INDEX topics_subject_id_idx ON public.topics(subject_id);
   CREATE UNIQUE INDEX questions_resource_question_unique ON public.questions(resource_id, question_no);
   
   For RLS policies, revert by replacing (SELECT auth.uid()) back to auth.uid().
   
============================================================================ */

BEGIN;

-- ============================================================================
-- PART 1: DROP DUPLICATE INDEXES
-- ============================================================================
-- Keep the shorter/cleaner named index, drop the redundant one.

-- job_progress: keep idx_job_progress_job, drop idx_job_progress_job_id
DROP INDEX IF EXISTS public.idx_job_progress_job_id;

-- subjects: keep idx_subjects_user_id, drop subjects_user_id_idx
DROP INDEX IF EXISTS public.subjects_user_id_idx;

-- topics: keep idx_topics_module_id, drop topics_module_id_idx
DROP INDEX IF EXISTS public.topics_module_id_idx;

-- topics: keep idx_topics_subject_id, drop topics_subject_id_idx
DROP INDEX IF EXISTS public.topics_subject_id_idx;

-- questions: keep questions_resource_no_uniq, drop questions_resource_question_unique
-- Note: This is a UNIQUE CONSTRAINT, not a regular index, so we use ALTER TABLE
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_resource_question_unique;


-- ============================================================================
-- PART 2: FIX RLS POLICIES (Replace auth.uid() with (SELECT auth.uid()))
-- ============================================================================
-- This prevents per-row re-evaluation, improving query performance at scale.

-- subjects_all_own
DROP POLICY IF EXISTS "subjects_all_own" ON public.subjects;
CREATE POLICY "subjects_all_own" ON public.subjects
  FOR ALL USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- profiles_all_own
DROP POLICY IF EXISTS "profiles_all_own" ON public.profiles;
CREATE POLICY "profiles_all_own" ON public.profiles
  FOR ALL USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- resources_select_own
DROP POLICY IF EXISTS "resources_select_own" ON public.resources;
CREATE POLICY "resources_select_own" ON public.resources
  FOR SELECT USING (subject_id IN (
    SELECT id FROM subjects WHERE user_id = (SELECT auth.uid())
  ));

-- resources_insert_own
DROP POLICY IF EXISTS "resources_insert_own" ON public.resources;
CREATE POLICY "resources_insert_own" ON public.resources
  FOR INSERT WITH CHECK (subject_id IN (
    SELECT id FROM subjects WHERE user_id = (SELECT auth.uid())
  ));

-- job_progress_select_via_resource
DROP POLICY IF EXISTS "job_progress_select_via_resource" ON public.job_progress;
CREATE POLICY "job_progress_select_via_resource" ON public.job_progress
  FOR SELECT USING (resource_id IN (
    SELECT r.id FROM resources r
    JOIN subjects s ON r.subject_id = s.id
    WHERE s.user_id = (SELECT auth.uid())
  ));

-- modules_select_own
DROP POLICY IF EXISTS "modules_select_own" ON public.modules;
CREATE POLICY "modules_select_own" ON public.modules
  FOR SELECT USING (subject_id IN (
    SELECT id FROM subjects WHERE user_id = (SELECT auth.uid())
  ));

-- topics_select_own
DROP POLICY IF EXISTS "topics_select_own" ON public.topics;
CREATE POLICY "topics_select_own" ON public.topics
  FOR SELECT USING (subject_id IN (
    SELECT id FROM subjects WHERE user_id = (SELECT auth.uid())
  ));

-- questions_select_own
DROP POLICY IF EXISTS "questions_select_own" ON public.questions;
CREATE POLICY "questions_select_own" ON public.questions
  FOR SELECT USING (subject_id IN (
    SELECT id FROM subjects WHERE user_id = (SELECT auth.uid())
  ));

-- prediction_runs_select_own
DROP POLICY IF EXISTS "prediction_runs_select_own" ON public.prediction_runs;
CREATE POLICY "prediction_runs_select_own" ON public.prediction_runs
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- prediction_topic_scores_select_own
DROP POLICY IF EXISTS "prediction_topic_scores_select_own" ON public.prediction_topic_scores;
CREATE POLICY "prediction_topic_scores_select_own" ON public.prediction_topic_scores
  FOR SELECT USING (prediction_run_id IN (
    SELECT id FROM prediction_runs WHERE user_id = (SELECT auth.uid())
  ));

-- question_topics_select_own
DROP POLICY IF EXISTS "question_topics_select_own" ON public.question_topics;
CREATE POLICY "question_topics_select_own" ON public.question_topics
  FOR SELECT USING (question_id IN (
    SELECT id FROM questions WHERE subject_id IN (
      SELECT id FROM subjects WHERE user_id = (SELECT auth.uid())
    )
  ));

-- teacher_hints_select_own
DROP POLICY IF EXISTS "teacher_hints_select_own" ON public.teacher_hints;
CREATE POLICY "teacher_hints_select_own" ON public.teacher_hints
  FOR SELECT USING (subject_id IN (
    SELECT id FROM subjects WHERE user_id = (SELECT auth.uid())
  ));

-- teacher_hints_insert_own
DROP POLICY IF EXISTS "teacher_hints_insert_own" ON public.teacher_hints;
CREATE POLICY "teacher_hints_insert_own" ON public.teacher_hints
  FOR INSERT WITH CHECK (subject_id IN (
    SELECT id FROM subjects WHERE user_id = (SELECT auth.uid())
  ));

-- exam_scopes policies
DROP POLICY IF EXISTS "Users can view own exam scopes" ON public.exam_scopes;
CREATE POLICY "Users can view own exam scopes" ON public.exam_scopes
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own exam scopes" ON public.exam_scopes;
CREATE POLICY "Users can create own exam scopes" ON public.exam_scopes
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own exam scopes" ON public.exam_scopes;
CREATE POLICY "Users can update own exam scopes" ON public.exam_scopes
  FOR UPDATE USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own exam scopes" ON public.exam_scopes;
CREATE POLICY "Users can delete own exam scopes" ON public.exam_scopes
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- exam_scope_topics policies
DROP POLICY IF EXISTS "Users can view own scope topics" ON public.exam_scope_topics;
CREATE POLICY "Users can view own scope topics" ON public.exam_scope_topics
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM exam_scopes
    WHERE exam_scopes.id = exam_scope_topics.exam_scope_id
    AND exam_scopes.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Users can add topics to own scopes" ON public.exam_scope_topics;
CREATE POLICY "Users can add topics to own scopes" ON public.exam_scope_topics
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM exam_scopes
    WHERE exam_scopes.id = exam_scope_topics.exam_scope_id
    AND exam_scopes.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Users can remove topics from own scopes" ON public.exam_scope_topics;
CREATE POLICY "Users can remove topics from own scopes" ON public.exam_scope_topics
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM exam_scopes
    WHERE exam_scopes.id = exam_scope_topics.exam_scope_id
    AND exam_scopes.user_id = (SELECT auth.uid())
  ));

COMMIT;
