/* ============================================================================
   MIGRATION: Database Cleanup Round 2 - Remaining Duplicate Indexes
   ============================================================================
   
   FILE: supabase/migrations/20260120182700_cleanup_remaining_indexes.sql
   CREATED: 2026-01-20
   
   ============================================================================
   PURPOSE
   ============================================================================
   
   Drop remaining duplicate indexes discovered after first cleanup:
   - question_topics: idx_question_topics_topic ↔ question_topics_topic_id_idx
   - questions: idx_questions_resource, idx_questions_resource_id, questions_resource_id_idx (3 identical)
   - questions: idx_questions_subject_id ↔ questions_subject_id_idx
   
   ============================================================================
   ROLLBACK PLAN
   ============================================================================
   
   If issues arise, recreate dropped indexes:
   
   CREATE INDEX question_topics_topic_id_idx ON public.question_topics(topic_id);
   CREATE INDEX idx_questions_resource_id ON public.questions(resource_id);
   CREATE INDEX questions_resource_id_idx ON public.questions(resource_id);
   CREATE INDEX questions_subject_id_idx ON public.questions(subject_id);
   
============================================================================ */

BEGIN;

-- question_topics: keep idx_question_topics_topic, drop question_topics_topic_id_idx
DROP INDEX IF EXISTS public.question_topics_topic_id_idx;

-- questions (resource_id): keep idx_questions_resource, drop the other two
DROP INDEX IF EXISTS public.idx_questions_resource_id;
DROP INDEX IF EXISTS public.questions_resource_id_idx;

-- questions (subject_id): keep idx_questions_subject_id, drop questions_subject_id_idx
DROP INDEX IF EXISTS public.questions_subject_id_idx;

COMMIT;
