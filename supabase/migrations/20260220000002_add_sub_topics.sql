-- ============================================================================
-- MIGRATION: Add sub-topic granularity
-- Created: 2026-02-20
-- ============================================================================
--
-- PURPOSE:
-- --------
-- Enables 3-level syllabus hierarchy: Module → Topic → Sub-topics.
-- Topics remain FK-referenceable entities; sub-topics are stored
-- as a JSONB array (strings) on the topic row.
--
-- DESIGN DECISION: JSONB vs separate table
-- -----------------------------------------
-- Sub-topics are NOT given their own UUID. Rationale:
--   - Sub-topics are metadata, not user-owned entities
--   - They are rewritten on every syllabus re-process (DELETE+INSERT pattern)
--   - No independent FK references needed (questions link to parent topic)
--   - Avoids a 4th level of JOIN complexity in queries
--
-- exam_scope_topics.selected_sub_topics:
--   NULL  = all sub-topics selected (additive default)
--   '["Decision Tables", "BVA"]' = only these sub-topics are in scope
--
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Add sub_topics to topics
-- ============================================================================

ALTER TABLE public.topics
  ADD COLUMN IF NOT EXISTS sub_topics jsonb NOT NULL DEFAULT '[]';

COMMENT ON COLUMN public.topics.sub_topics IS
  'Array of sub-topic name strings extracted from the syllabus. '
  'e.g. ["Decision Tables", "Equivalence Class Partitioning"]. '
  'Empty array = no sub-topics listed for this topic.';

-- ============================================================================
-- 2. Add selected_sub_topics to exam_scope_topics
-- ============================================================================

ALTER TABLE public.exam_scope_topics
  ADD COLUMN IF NOT EXISTS selected_sub_topics jsonb DEFAULT NULL;

COMMENT ON COLUMN public.exam_scope_topics.selected_sub_topics IS
  'Which sub-topics the user has selected within this topic for their exam scope. '
  'NULL = all sub-topics included (additive default). '
  'JSON array of strings = only these sub-topics are in scope. '
  'e.g. ["Decision Tables", "BVA"] means only those two count, not Error Guessing.';

-- ============================================================================
-- 3. GIN index on sub_topics for containment queries
-- ============================================================================
-- Enables fast @> (contains) queries like:
--   WHERE sub_topics @> '["Decision Tables"]'
-- Useful for the question matching pipeline and future search.

CREATE INDEX IF NOT EXISTS idx_topics_sub_topics_gin
  ON public.topics USING gin(sub_topics);

COMMIT;
