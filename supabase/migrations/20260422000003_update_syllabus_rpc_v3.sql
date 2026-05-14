-- ============================================================================
-- MIGRATION: Update save_module_with_topics_secure to create child rows
-- Created: 2026-04-22
-- ============================================================================
--
-- PURPOSE:
-- --------
-- Replaces the syllabus RPC so that when a syllabus is processed:
--   1. Parent topic rows are inserted (as before)
--   2. For each sub-topic string, a CHILD topic row is also inserted
--      with parent_topic_id pointing to the parent
--
-- This ensures that re-processing a syllabus creates the full hierarchy.
--
-- The DELETE at the top cascades to children via the parent_topic_id FK
-- (ON DELETE CASCADE), so the full re-create pattern is safe.
--
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION save_module_with_topics_secure(
  p_subject_id uuid,
  p_module_no integer,
  p_module_title text,
  p_topics jsonb
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_module_id uuid;
  v_topic jsonb;
  v_parent_id uuid;
  v_sub_topic text;
  v_child_no integer;
BEGIN

  -- ── VALIDATION ────────────────────────────────────────────────────────────

  IF p_subject_id IS NULL THEN
    RAISE EXCEPTION 'subject_id cannot be null';
  END IF;

  IF p_module_no IS NULL OR p_module_no <= 0 THEN
    RAISE EXCEPTION 'module_no must be a positive integer';
  END IF;

  IF p_module_title IS NULL OR length(trim(p_module_title)) = 0 THEN
    RAISE EXCEPTION 'module_title cannot be empty';
  END IF;

  IF p_topics IS NULL OR jsonb_typeof(p_topics) <> 'array' THEN
    RAISE EXCEPTION 'p_topics must be a JSON array';
  END IF;

  -- ── UPSERT MODULE ─────────────────────────────────────────────────────────

  INSERT INTO modules (subject_id, module_no, title)
  VALUES (p_subject_id, p_module_no, p_module_title)
  ON CONFLICT (subject_id, module_no)
  DO UPDATE SET title = EXCLUDED.title
  RETURNING id INTO v_module_id;

  -- Row lock for concurrency safety
  PERFORM 1 FROM modules WHERE id = v_module_id FOR UPDATE;

  -- ── REPLACE TOPICS ────────────────────────────────────────────────────────
  -- Deleting parent topics cascades to children via ON DELETE CASCADE
  -- on the parent_topic_id FK.

  DELETE FROM topics WHERE module_id = v_module_id;

  -- ── INSERT TOPICS WITH CHILD ROWS ─────────────────────────────────────────

  FOR v_topic IN
    SELECT value FROM jsonb_array_elements(p_topics)
  LOOP

    IF NOT (v_topic ? 'name') OR NOT (v_topic ? 'topic_no') THEN
      RAISE EXCEPTION 'Each topic must contain name and topic_no. Got: %', v_topic;
    END IF;

    IF length(trim(v_topic->>'name')) = 0 THEN
      RAISE EXCEPTION 'Topic name cannot be empty';
    END IF;

    IF (v_topic->>'topic_no')::integer <= 0 THEN
      RAISE EXCEPTION 'topic_no must be a positive integer';
    END IF;

    -- Insert PARENT topic row (keeps sub_topics JSON for reference)
    INSERT INTO topics (
      subject_id,
      module_id,
      name,
      topic_no,
      is_core,
      sub_topics,
      parent_topic_id  -- NULL = this is a parent
    )
    VALUES (
      p_subject_id,
      v_module_id,
      (v_topic->>'name')::text,
      (v_topic->>'topic_no')::integer,
      COALESCE((v_topic->>'is_core')::boolean, false),
      COALESCE(v_topic->'sub_topics', '[]'::jsonb),
      NULL  -- Parent topic
    )
    RETURNING id INTO v_parent_id;

    -- Insert CHILD topic rows for each sub-topic string
    v_child_no := 1;
    IF v_topic->'sub_topics' IS NOT NULL
       AND jsonb_typeof(v_topic->'sub_topics') = 'array'
       AND jsonb_array_length(v_topic->'sub_topics') > 0 THEN

      FOR v_sub_topic IN
        SELECT jsonb_array_elements_text(v_topic->'sub_topics')
      LOOP
        INSERT INTO topics (
          subject_id,
          module_id,
          name,
          topic_no,
          is_core,
          sub_topics,
          parent_topic_id
        )
        VALUES (
          p_subject_id,
          v_module_id,
          v_sub_topic,
          v_child_no,
          false,
          '[]'::jsonb,
          v_parent_id  -- Points to parent
        );

        v_child_no := v_child_no + 1;
      END LOOP;
    END IF;

  END LOOP;

END;
$$;

COMMENT ON FUNCTION save_module_with_topics_secure(uuid, integer, text, jsonb) IS
  'Atomically saves a module, its parent topics, and child topic rows. '
  'p_topics accepts: { name, topic_no, is_core?, sub_topics?: string[] }. '
  'Each sub-topic string becomes a child row with parent_topic_id set.';

COMMIT;
