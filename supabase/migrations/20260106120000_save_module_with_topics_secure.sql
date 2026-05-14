-- ============================================================================
-- MIGRATION: save_module_with_topics_secure
-- Created: 2026-01-06
-- Author: LastDayLLM Team
-- ============================================================================
--
-- PURPOSE:
-- --------
-- This function atomically saves a module and all its topics in a single
-- database transaction. It replaces the previous approach of multiple
-- separate API calls from the Trigger.dev worker (process-document.ts).
--
-- HOW IT'S USED IN THE APP:
-- -------------------------
-- 1. User uploads a syllabus PDF/image via the dev-test page
-- 2. The upload triggers the process-document.ts Trigger.dev task
-- 3. AI (Gemma) extracts modules and topics from the syllabus
-- 4. Instead of multiple .upsert() calls, we now call this single RPC:
--
--    await supabase.rpc('save_module_with_topics_secure', {
--      p_subject_id: subjectId,
--      p_module_no: 1,
--      p_module_title: 'Introduction to DBMS',
--      p_topics: JSON.stringify([
--        { name: 'Database Concepts', topic_no: 1, is_core: false },
--        { name: 'ER Model', topic_no: 2, is_core: true }
--      ])
--    });
--
-- WHY THIS IS BETTER THAN THE OLD APPROACH:
-- ------------------------------------------
-- | Old Approach (process-document.ts)     | New Approach (this function)       |
-- |----------------------------------------|-------------------------------------|
-- | Multiple network round-trips (2n)      | Single RPC call                     |
-- | No atomicity - partial data on crash   | Full transaction - all or nothing   |
-- | No locking - race conditions possible  | FOR UPDATE lock prevents races      |
-- | Upsert leaves orphan topics            | DELETE + INSERT = clean slate       |
-- | Validation only in app code            | Double validation (app + database)  |
--
-- IMPORTANT NOTES:
-- ----------------
-- 1. Topics are treated as CONFIGURATION data, not user-generated content.
--    DELETE + INSERT is intentional - re-processing should replace everything.
--
-- 2. If you later add user data tied to topic IDs (study progress, bookmarks),
--    you'll need to preserve those IDs. Consider switching to UPSERT then.
--
-- 3. This function works with existing constraints:
--    - modules_subject_module_unique (from 20250101_add_db_constraints.sql)
--    - topics_module_name_unique (from 20250101_add_db_constraints.sql)
--
-- 4. The function is SECURITY DEFINER by default in PL/pgSQL, meaning it
--    runs with the privileges of the function owner (postgres), not the caller.
--    This is fine for internal use via authenticated Supabase client.
--
-- PARAMETERS:
-- -----------
-- p_subject_id   UUID    - The subject this module belongs to (required)
-- p_module_no    INTEGER - Module number, must be positive (1, 2, 3...)
-- p_module_title TEXT    - Human-readable module title
-- p_topics       JSONB   - Array of topic objects with structure:
--                          { name: string, topic_no: number, is_core?: boolean }
--
-- RETURNS: void
-- RAISES:  Exceptions with descriptive messages on validation failure
--
-- ============================================================================

BEGIN;

-- Create the function with CREATE OR REPLACE so it's idempotent
-- (can be run multiple times without error)
CREATE OR REPLACE FUNCTION save_module_with_topics_secure(
  p_subject_id uuid,      -- FK to subjects.id - which subject owns this module
  p_module_no integer,    -- Module sequence number (1, 2, 3, etc.)
  p_module_title text,    -- Display title for the module
  p_topics jsonb          -- Array of topic objects to insert
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_module_id uuid;       -- Will hold the module ID after upsert
  v_topic jsonb;          -- Loop variable for iterating topics
BEGIN

  /* =========================================================================
     SECTION 1: INPUT VALIDATION
     -------------------------------------------------------------------------
     These checks provide defense-in-depth. Even though the app validates
     data before calling this function, we validate again at the database
     level to prevent data corruption from bugs or direct API calls.
  ========================================================================= */

  -- Check 1: subject_id must be provided
  -- Without this, we'd have orphan modules not belonging to any subject
  IF p_subject_id IS NULL THEN
    RAISE EXCEPTION 'subject_id cannot be null';
  END IF;

  -- Check 2: module_no must be a positive integer
  -- Modules are numbered 1, 2, 3... Zero or negative makes no sense
  IF p_module_no IS NULL OR p_module_no <= 0 THEN
    RAISE EXCEPTION 'module_no must be a positive integer';
  END IF;

  -- Check 3: module_title must have actual content
  -- Empty titles would create confusing UI
  IF p_module_title IS NULL OR length(trim(p_module_title)) = 0 THEN
    RAISE EXCEPTION 'module_title cannot be empty';
  END IF;

  -- Check 4: p_topics must be a JSON array
  -- We use jsonb_array_elements later, which requires an array type
  IF p_topics IS NULL OR jsonb_typeof(p_topics) <> 'array' THEN
    RAISE EXCEPTION 'p_topics must be a JSON array';
  END IF;

  /* =========================================================================
     SECTION 2: UPSERT MODULE WITH ROW LOCKING
     -------------------------------------------------------------------------
     This uses PostgreSQL's INSERT ... ON CONFLICT for idempotent updates.
     The FOR UPDATE lock prevents race conditions when multiple requests
     try to update the same module simultaneously.
  ========================================================================= */

  -- Upsert the module: insert if new, update title if exists
  -- Uses the unique constraint: (subject_id, module_no)
  INSERT INTO modules (subject_id, module_no, title)
  VALUES (p_subject_id, p_module_no, p_module_title)
  ON CONFLICT (subject_id, module_no)         -- Match on business key
  DO UPDATE SET title = EXCLUDED.title        -- Update title if exists
  RETURNING id INTO v_module_id;              -- Capture the ID for topics

  -- Explicit row lock to prevent concurrent modifications
  -- Another transaction trying to modify this row will wait
  PERFORM 1
  FROM modules
  WHERE id = v_module_id
  FOR UPDATE;

  /* =========================================================================
     SECTION 3: DELETE EXISTING TOPICS
     -------------------------------------------------------------------------
     Topics are CONFIGURATION data extracted from syllabi, not user-generated
     content. When re-processing a syllabus, we want a complete replacement.
     
     WARNING: If you later add user data (progress, bookmarks) tied to
     topic IDs, you'll need to change this to an UPSERT approach instead!
  ========================================================================= */

  -- Remove all existing topics for this module
  -- CASCADE will handle any future child relationships
  DELETE FROM topics
  WHERE module_id = v_module_id;

  /* =========================================================================
     SECTION 4: INSERT NEW TOPICS WITH VALIDATION
     -------------------------------------------------------------------------
     Loop through each topic in the JSON array, validate it, and insert.
     This ensures we never insert malformed topic data.
  ========================================================================= */

  -- Iterate over each topic object in the JSON array
  FOR v_topic IN
    SELECT value FROM jsonb_array_elements(p_topics)
  LOOP
  
    -- Validate: Each topic must have 'name' and 'topic_no' fields
    IF NOT (v_topic ? 'name') OR NOT (v_topic ? 'topic_no') THEN
      RAISE EXCEPTION 'Each topic must contain name and topic_no. Got: %', v_topic;
    END IF;

    -- Validate: Topic name cannot be empty or just whitespace
    IF length(trim(v_topic->>'name')) = 0 THEN
      RAISE EXCEPTION 'Topic name cannot be empty';
    END IF;

    -- Validate: topic_no must be a positive integer (1, 2, 3...)
    IF (v_topic->>'topic_no')::integer <= 0 THEN
      RAISE EXCEPTION 'topic_no must be a positive integer';
    END IF;

    -- Insert the validated topic
    -- subject_id is denormalized for easier querying across all topics
    INSERT INTO topics (
      subject_id,   -- FK to subjects table (denormalized for perf)
      module_id,    -- FK to modules table
      name,         -- Topic display name
      topic_no,     -- Sequence within module (1, 2, 3...)
      is_core       -- Whether this is a "core" topic (defaults to false)
    )
    VALUES (
      p_subject_id,
      v_module_id,
      (v_topic->>'name')::text,
      (v_topic->>'topic_no')::integer,
      COALESCE((v_topic->>'is_core')::boolean, false)   -- Default: false
    );
    
  END LOOP;

  /* =========================================================================
     SECTION 5: IMPLICIT COMMIT
     -------------------------------------------------------------------------
     PL/pgSQL functions run in a single transaction. If we reach this point
     without exceptions, everything commits atomically. If any exception
     was raised, everything rolls back automatically.
  ========================================================================= */

END;
$$;

-- Add a comment to the function for documentation in psql/pgAdmin
COMMENT ON FUNCTION save_module_with_topics_secure(uuid, integer, text, jsonb) IS
  'Atomically saves a module and its topics. Used by process-document.ts after AI extraction. Validates all inputs, uses row locking for concurrency safety, and replaces existing topics.';

-- ============================================================================
-- ADDITIONAL CONSTRAINT: Unique topic_no per module
-- ============================================================================
-- This ensures no two topics in the same module can have the same topic_no.
-- Combined with the existing topics_module_name_unique constraint, this gives:
--   - (module_id, name) must be unique   <-- from 20250101_add_db_constraints.sql
--   - (module_id, topic_no) must be unique <-- added here
--
-- This prevents data corruption from bugs or direct API calls.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'topics_module_topic_no_unique'
  ) THEN
    ALTER TABLE topics
    ADD CONSTRAINT topics_module_topic_no_unique
    UNIQUE (module_id, topic_no);
  END IF;
END $$;

COMMIT;
