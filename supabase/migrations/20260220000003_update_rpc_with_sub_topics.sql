-- ============================================================================
-- MIGRATION: Update save_module_with_topics_secure to support sub_topics
-- Created: 2026-02-20
-- ============================================================================
--
-- PURPOSE:
-- --------
-- Replaces the save_module_with_topics_secure function to accept sub_topics
-- per topic object and persist them into the new topics.sub_topics column.
--
-- CHANGED:
-- --------
-- p_topics JSON now accepts:
--   { name: string, topic_no: number, is_core?: boolean, sub_topics?: string[] }
-- Previously:
--   { name: string, topic_no: number, is_core?: boolean }
--
-- BACKWARDS COMPATIBLE:
-- ---------------------
-- sub_topics defaults to '[]' if missing from the input JSON.
-- Old callers without sub_topics will still work correctly.
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
  -- Topics are configuration data; DELETE + INSERT is intentional.
  -- WARNING: If you ever add user data tied to topic IDs (progress, bookmarks),
  --          switch to UPSERT here.

  DELETE FROM topics WHERE module_id = v_module_id;

  -- ── INSERT TOPICS WITH SUB-TOPICS ────────────────────────────────────────

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

    -- sub_topics defaults to '[]' if not present in input (backwards compat)
    INSERT INTO topics (
      subject_id,
      module_id,
      name,
      topic_no,
      is_core,
      sub_topics              -- NEW: store sub-topic names array
    )
    VALUES (
      p_subject_id,
      v_module_id,
      (v_topic->>'name')::text,
      (v_topic->>'topic_no')::integer,
      COALESCE((v_topic->>'is_core')::boolean, false),
      COALESCE(v_topic->'sub_topics', '[]'::jsonb)   -- default to empty array
    );

  END LOOP;

END;
$$;

COMMENT ON FUNCTION save_module_with_topics_secure(uuid, integer, text, jsonb) IS
  'Atomically saves a module and its topics including sub_topics array. '
  'p_topics accepts: { name, topic_no, is_core?, sub_topics?: string[] }. '
  'sub_topics defaults to [] if not provided (backwards compatible).';

COMMIT;
