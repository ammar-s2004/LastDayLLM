-- ============================================================================
-- MIGRATION: Add parent_topic_id to topics
-- Created: 2026-04-22
-- ============================================================================
--
-- PURPOSE:
-- --------
-- Adds a self-referencing FK on topics so sub-topics become first-class rows.
-- Parent topics (headings) have parent_topic_id = NULL.
-- Child topics (sub-topics) have parent_topic_id pointing to their parent.
--
-- This enables all ETSM signals to score at the granular sub-topic level
-- instead of at the broad heading level.
--
-- ============================================================================

BEGIN;

-- 1. Add parent_topic_id column
ALTER TABLE public.topics
  ADD COLUMN IF NOT EXISTS parent_topic_id uuid REFERENCES public.topics(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.topics.parent_topic_id IS
  'Self-referencing FK. NULL = this is a parent/heading topic. '
  'Non-null = this is a child (promoted sub-topic) pointing to its parent.';

-- 2. Index for efficient child lookups
CREATE INDEX IF NOT EXISTS idx_topics_parent_topic_id
  ON public.topics(parent_topic_id);

-- 3. Update unique constraint to support children
-- Old constraint: (module_id, name) — prevents same-name topics in a module
-- New constraint: (module_id, name, coalesced parent) — allows "Introduction" as parent
-- and "Introduction" as a child of a different parent (unlikely but safe)
ALTER TABLE public.topics
  DROP CONSTRAINT IF EXISTS topics_module_name_unique;
  
ALTER TABLE public.topics
  DROP CONSTRAINT IF EXISTS topics_module_topic_no_unique;

-- Use a unique index with COALESCE to handle NULL parent_topic_id
CREATE UNIQUE INDEX IF NOT EXISTS topics_module_name_parent_unique
  ON public.topics (module_id, name, COALESCE(parent_topic_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE UNIQUE INDEX IF NOT EXISTS topics_module_parent_topic_no_unique
  ON public.topics (module_id, COALESCE(parent_topic_id, '00000000-0000-0000-0000-000000000000'::uuid), topic_no);

COMMIT;
