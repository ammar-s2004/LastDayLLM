-- ============================================================================
-- MIGRATION: Create Exam Scopes (Industry-Standard Normalized Design)
-- Created: 2026-01-06
-- Author: LastDayLLM Team
-- ============================================================================
--
-- PURPOSE:
-- --------
-- This migration creates the exam scope system using a normalized design
-- with a junction table. This replaces the previous array-based approach.
--
-- WHY NORMALIZED (not UUID array)?
-- ---------------------------------
-- | Feature                    | Array         | Normalized (This)    |
-- |----------------------------|---------------|----------------------|
-- | FK enforcement on topics   | ❌ No         | ✅ Yes               |
-- | Cascade on topic delete    | ❌ No         | ✅ Yes               |
-- | Analytics queries          | ❌ Hard       | ✅ Easy              |
-- | Schema evolution           | ⚠️ Limited    | ✅ Flexible          |
-- | Silent corruption risk     | ⚠️ Yes        | ✅ Zero              |
--
-- SCHEMA DESIGN:
-- --------------
-- exam_scopes (1) ──────< exam_scope_topics (N) >────── topics (1)
--
--   exam_scopes: WHO + WHAT exam + WHEN
--   exam_scope_topics: WHICH topics are included (junction table)
--
-- EXAMPLE DATA:
-- -------------
-- exam_scopes:
--   { id: "scope-1", subject_id: "abc", user_id: "user-1", exam_type: "MIDTERM" }
--
-- exam_scope_topics:
--   { exam_scope_id: "scope-1", topic_id: "topic-1" }
--   { exam_scope_id: "scope-1", topic_id: "topic-2" }
--   { exam_scope_id: "scope-1", topic_id: "topic-5" }
--
-- INSERTION PATTERN:
-- ------------------
-- 1. Insert scope:
--    INSERT INTO exam_scopes (subject_id, user_id, exam_type)
--    VALUES (:subject_id, :user_id, :exam_type)
--    RETURNING id;
--
-- 2. Bulk insert topics (atomic):
--    INSERT INTO exam_scope_topics (exam_scope_id, topic_id)
--    SELECT :scope_id, unnest(:topic_ids::uuid[]);
--
-- 3. Wrap both in a single transaction.
--
-- APP INTEGRATION:
-- ----------------
-- | Component               | How It Uses exam_scopes                  |
-- |-------------------------|------------------------------------------|
-- | Future: Scope UI        | User selects which topics to include     |
-- | Future: Question Gen    | Filters questions to included topics     |
-- | Future: Study Mode      | Shows only topics in exam scope          |
-- | Future: Predictions     | Predicts based on scoped topic frequency |
--
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. EXAM_SCOPES — The scope metadata
-- ============================================================================
-- One row = one exam configuration for a user
-- Answers: Who? Which subject? Which exam? When?

CREATE TABLE IF NOT EXISTS public.exam_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  subject_id uuid NOT NULL
    REFERENCES public.subjects(id)
    ON DELETE CASCADE,

  user_id uuid NOT NULL
    REFERENCES auth.users(id)
    ON DELETE CASCADE,

  exam_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- One scope per user per exam per subject
  CONSTRAINT exam_scopes_unique
    UNIQUE (subject_id, user_id, exam_type)
);

-- ============================================================================
-- 2. EXAM_SCOPE_TOPICS — The junction table (critical)
-- ============================================================================
-- This is where "which topics are included" actually lives.
-- 
-- What this enforces:
--   ✅ Every topic MUST exist (FK to topics)
--   ✅ Every scope MUST exist (FK to exam_scopes)
--   ✅ Deleting either cleans up automatically (CASCADE)
--   ✅ No duplicates, ever (composite PK)

CREATE TABLE IF NOT EXISTS public.exam_scope_topics (
  exam_scope_id uuid NOT NULL
    REFERENCES public.exam_scopes(id)
    ON DELETE CASCADE,

  topic_id uuid NOT NULL
    REFERENCES public.topics(id)
    ON DELETE CASCADE,

  -- Composite primary key prevents duplicates
  CONSTRAINT exam_scope_topics_pk
    PRIMARY KEY (exam_scope_id, topic_id)
);

-- ============================================================================
-- 3. INDEXES — Non-negotiable for performance
-- ============================================================================

-- Fetch all topics for a scope (common read pattern)
CREATE INDEX IF NOT EXISTS idx_exam_scope_topics_scope
ON public.exam_scope_topics(exam_scope_id);

-- Analytics / reverse lookup: "Which scopes include this topic?"
CREATE INDEX IF NOT EXISTS idx_exam_scope_topics_topic
ON public.exam_scope_topics(topic_id);

-- Common lookup: load a user's scope
CREATE INDEX IF NOT EXISTS idx_exam_scopes_lookup
ON public.exam_scopes(subject_id, user_id, exam_type);

-- All scopes for a user
CREATE INDEX IF NOT EXISTS idx_exam_scopes_user
ON public.exam_scopes(user_id);

-- ============================================================================
-- 4. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.exam_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_scope_topics ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. RLS POLICIES — Users can only access their own scopes
-- ============================================================================

-- exam_scopes: Users can read their own scopes
CREATE POLICY "Users can view own exam scopes"
ON public.exam_scopes
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- exam_scopes: Users can create their own scopes
CREATE POLICY "Users can create own exam scopes"
ON public.exam_scopes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- exam_scopes: Users can update their own scopes
CREATE POLICY "Users can update own exam scopes"
ON public.exam_scopes
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- exam_scopes: Users can delete their own scopes
CREATE POLICY "Users can delete own exam scopes"
ON public.exam_scopes
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- exam_scope_topics: Users can view topics for their scopes
CREATE POLICY "Users can view own scope topics"
ON public.exam_scope_topics
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.exam_scopes
    WHERE id = exam_scope_id AND user_id = auth.uid()
  )
);

-- exam_scope_topics: Users can insert topics for their scopes
CREATE POLICY "Users can add topics to own scopes"
ON public.exam_scope_topics
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.exam_scopes
    WHERE id = exam_scope_id AND user_id = auth.uid()
  )
);

-- exam_scope_topics: Users can delete topics from their scopes
CREATE POLICY "Users can remove topics from own scopes"
ON public.exam_scope_topics
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.exam_scopes
    WHERE id = exam_scope_id AND user_id = auth.uid()
  )
);

COMMIT;

-- ============================================================================
-- NOTES FOR DEVELOPERS:
-- ============================================================================
--
-- EMPTY SCOPE PREVENTION:
-- -----------------------
-- Databases can't enforce "at least one row in a join table" with constraints.
-- Enforce this in application logic or a write function:
--
--   DO $$
--   BEGIN
--     IF NOT EXISTS (
--       SELECT 1 FROM exam_scope_topics WHERE exam_scope_id = :scope_id
--     ) THEN
--       RAISE EXCEPTION 'Exam scope must include at least one topic';
--     END IF;
--   END $$;
--
-- QUERY EXAMPLES:
-- ---------------
-- Get all topics for a scope:
--   SELECT t.* FROM topics t
--   JOIN exam_scope_topics est ON t.id = est.topic_id
--   WHERE est.exam_scope_id = :scope_id;
--
-- Get a user's scope with topic count:
--   SELECT es.*, COUNT(est.topic_id) as topic_count
--   FROM exam_scopes es
--   LEFT JOIN exam_scope_topics est ON es.id = est.exam_scope_id
--   WHERE es.user_id = :user_id
--   GROUP BY es.id;
--
-- ============================================================================
