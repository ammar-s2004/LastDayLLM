-- ============================================================================
-- MIGRATION: Add Topic Ordering Support
-- Created: 2026-01-04
-- Author: LastDayLLM Team
-- ============================================================================
--
-- PURPOSE:
-- --------
-- This migration adds the `topic_no` column to enable ordered display of
-- topics within a module. Without this, topics would display in insertion
-- order (random from user's perspective).
--
-- TECHNICAL ROLE:
-- ---------------
-- The `topic_no` column stores the sequence number of each topic:
--   Module 1: "Introduction"
--     - Topic 1: "What is DBMS"      (topic_no = 1)
--     - Topic 2: "History"           (topic_no = 2)
--     - Topic 3: "Applications"      (topic_no = 3)
--
-- DATABASE ROLE:
-- --------------
-- - topic_no column: Stores ordering integer (1, 2, 3...)
-- - idx_topics_module_order: Composite index for fast ORDER BY queries
--   This index optimizes: SELECT * FROM topics WHERE module_id=? ORDER BY topic_no
--
-- APP INTEGRATION:
-- ----------------
-- | Component               | How It Uses topic_no                     |
-- |-------------------------|------------------------------------------|
-- | process-document.ts     | Sets topic_no from array index + 1       |
-- | save_module_with_topics | Validates topic_no is positive integer   |
-- | dev-test/page.tsx       | Could use for ordered topic display      |
-- | Future: Study UI        | Display topics in syllabus order         |
--
-- EXAMPLE QUERY (after this migration):
-- -------------------------------------
--   SELECT name, topic_no
--   FROM topics
--   WHERE module_id = 'abc-123'
--   ORDER BY topic_no ASC;
--
-- WHY NOT JUST USE created_at?
-- ----------------------------
-- - Syllabus order ≠ insertion order (AI might extract out of order)
-- - Re-processing should preserve original syllabus ordering
-- - Explicit ordering is clearer and more maintainable
--
-- NOTE ON NULL:
-- -------------
-- Currently allows NULL for backward compatibility with existing data.
-- After backfilling existing topics, consider adding NOT NULL constraint:
--   ALTER TABLE topics ALTER COLUMN topic_no SET NOT NULL;
--
-- ============================================================================

BEGIN;

-- Add topic_no column to topics table
-- Allows NULL initially for backward compatibility with existing data
ALTER TABLE public.topics
ADD COLUMN IF NOT EXISTS topic_no integer;

-- Composite index for fast ordered queries within a module
-- Query pattern: WHERE module_id = ? ORDER BY topic_no
-- Covering both columns in index avoids table lookup for ordering
CREATE INDEX IF NOT EXISTS idx_topics_module_order
ON public.topics(module_id, topic_no);

COMMIT;
