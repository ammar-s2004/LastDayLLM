-- ============================================================================
-- MIGRATION: Update save_exam_scope_normalized to support selected_sub_topics
-- Created: 2026-02-20
-- ============================================================================
--
-- PURPOSE:
-- --------
-- Replaces save_exam_scope_normalized to accept per-topic selected_sub_topics.
--
-- ADDITIVE MODEL:
-- ---------------
-- When user picks a topic, ALL sub-topics are selected (selected_sub_topics=NULL).
-- User can then deselect specific sub-topics. Only those in the list are in scope.
--
-- INPUT FORMAT:
-- -------------
-- p_topics is a JSONB array of objects:
--   { "topic_id": "uuid", "selected_sub_topics": null }         -- all sub-topics
--   { "topic_id": "uuid", "selected_sub_topics": ["BVA"] }     -- only BVA
--
-- BACKWARDS COMPATIBLE:
-- ---------------------
-- Old callers passing p_topic_ids (uuid[]) still supported via the overloaded
-- wrapper function. The new primary function takes JSONB.
--
-- ============================================================================

BEGIN;

-- Updated function: accepts jsonb array with optional selected_sub_topics
CREATE OR REPLACE FUNCTION save_exam_scope_with_sub_topics(
  p_subject_id uuid,
  p_user_id uuid,
  p_exam_type text,
  p_topics jsonb    -- Array of {topic_id: uuid, selected_sub_topics: string[]|null}
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope_id uuid;
  v_topic jsonb;
  v_topic_id uuid;
  v_selected_sub_topics jsonb;
BEGIN
  -- Must have at least one topic
  IF p_topics IS NULL OR jsonb_array_length(p_topics) = 0 THEN
    RAISE EXCEPTION 'Exam scope must include at least one topic';
  END IF;

  -- Upsert the scope
  INSERT INTO exam_scopes (subject_id, user_id, exam_type)
  VALUES (p_subject_id, p_user_id, p_exam_type)
  ON CONFLICT (subject_id, user_id, exam_type)
  DO UPDATE SET exam_type = EXCLUDED.exam_type
  RETURNING id INTO v_scope_id;

  -- Replace all topics for this scope
  DELETE FROM exam_scope_topics
  WHERE exam_scope_id = v_scope_id;

  -- Insert topics with their selected_sub_topics
  FOR v_topic IN SELECT value FROM jsonb_array_elements(p_topics)
  LOOP
    v_topic_id := (v_topic->>'topic_id')::uuid;

    -- NULL = all sub-topics selected (additive default)
    -- JSON array = only these sub-topics are in scope
    IF (v_topic->'selected_sub_topics') = 'null'::jsonb
       OR NOT (v_topic ? 'selected_sub_topics') THEN
      v_selected_sub_topics := NULL;
    ELSE
      v_selected_sub_topics := v_topic->'selected_sub_topics';
    END IF;

    INSERT INTO exam_scope_topics (exam_scope_id, topic_id, selected_sub_topics)
    VALUES (v_scope_id, v_topic_id, v_selected_sub_topics);
  END LOOP;

  RETURN v_scope_id;
END;
$$;

GRANT EXECUTE ON FUNCTION save_exam_scope_with_sub_topics(uuid, uuid, text, jsonb) TO authenticated;

COMMENT ON FUNCTION save_exam_scope_with_sub_topics IS
  'Saves exam scope with per-topic sub-topic selection. '
  'selected_sub_topics=NULL means all sub-topics selected (additive default). '
  'selected_sub_topics=["BVA","Decision Tables"] means only those are in scope.';

COMMIT;
