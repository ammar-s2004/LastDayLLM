-- ============================================================================
-- MIGRATION: Promote existing sub-topics to child rows
-- Created: 2026-04-22
-- ============================================================================
--
-- PURPOSE:
-- --------
-- Takes every string in topics.sub_topics (JSONB array) and creates a new
-- child row in the topics table, pointing back to the parent via
-- parent_topic_id.
--
-- Also clears all existing signal scores since they were computed at the
-- parent (heading) level and are now invalid.
--
-- IDEMPOTENT: Uses ON CONFLICT DO NOTHING so re-running is safe.
--
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Promote sub-topics to child rows
-- ============================================================================

INSERT INTO public.topics (
  subject_id,
  module_id,
  name,
  topic_no,
  parent_topic_id,
  sub_topics,
  is_core
)
SELECT
  t.subject_id,
  t.module_id,
  st.subtopic_name,
  st.subtopic_no,
  t.id AS parent_topic_id,
  '[]'::jsonb,
  false
FROM public.topics t
CROSS JOIN LATERAL (
  SELECT
    elem::text AS subtopic_name_raw,
    -- Strip JSON quotes from text extraction
    trim(both '"' from elem::text) AS subtopic_name,
    ROW_NUMBER() OVER () AS subtopic_no
  FROM jsonb_array_elements_text(t.sub_topics) AS elem
) st
WHERE
  -- Only process parent topics (those without a parent themselves)
  t.parent_topic_id IS NULL
  -- Only process topics that actually have sub-topics
  AND jsonb_array_length(t.sub_topics) > 0
ON CONFLICT (module_id, name, COALESCE(parent_topic_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;

-- ============================================================================
-- 2. Clear stale parent-level signal data
-- ============================================================================
-- All these scores were computed against parent topic IDs.
-- They must be recomputed after child topics exist.

DELETE FROM public.topic_sp_scores;
DELETE FROM public.topic_wtf_scores;
DELETE FROM public.topic_te_scores;
DELETE FROM public.topic_a_scores;
DELETE FROM public.nc_scores;
DELETE FROM public.nc_topic_map;
DELETE FROM public.question_topics;
DELETE FROM public.prediction_topic_scores;

COMMIT;
