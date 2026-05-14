-- ============================================================================
-- MIGRATION: Add save_exam_scope_normalized RPC function
-- Created: 2026-01-06
-- ============================================================================
--
-- PURPOSE:
-- --------
-- Atomic function to save exam scope with topics in a single transaction.
-- Handles upsert + topic replacement atomically.
--
-- USAGE:
-- ------
-- SELECT save_exam_scope_normalized(
--   p_subject_id := 'uuid',
--   p_user_id := 'uuid',
--   p_exam_type := 'TERM TEST 1',
--   p_topic_ids := ARRAY['topic-uuid-1', 'topic-uuid-2']::uuid[]
-- );
--
-- RETURNS: The exam_scope_id (uuid)
--
-- ============================================================================

CREATE OR REPLACE FUNCTION save_exam_scope_normalized(
  p_subject_id uuid,
  p_user_id uuid,
  p_exam_type text,
  p_topic_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope_id uuid;
BEGIN
  -- Validate at least one topic
  IF array_length(p_topic_ids, 1) IS NULL OR array_length(p_topic_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Exam scope must include at least one topic';
  END IF;

  -- Upsert scope (insert or update on conflict)
  INSERT INTO exam_scopes (subject_id, user_id, exam_type)
  VALUES (p_subject_id, p_user_id, p_exam_type)
  ON CONFLICT (subject_id, user_id, exam_type)
  DO UPDATE SET exam_type = EXCLUDED.exam_type
  RETURNING id INTO v_scope_id;

  -- Clear existing topics for this scope
  DELETE FROM exam_scope_topics
  WHERE exam_scope_id = v_scope_id;

  -- Insert new topics
  INSERT INTO exam_scope_topics (exam_scope_id, topic_id)
  SELECT v_scope_id, unnest(p_topic_ids);

  RETURN v_scope_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION save_exam_scope_normalized(uuid, uuid, text, uuid[]) TO authenticated;
