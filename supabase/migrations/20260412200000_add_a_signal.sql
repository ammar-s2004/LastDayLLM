-- ============================================================================
-- Migration: Add A signal schema
-- Created: 2026-04-12
-- Purpose: Store assignment-based topic scores and subject-level assignment config
-- ============================================================================

BEGIN;

ALTER TABLE subjects
    ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS topic_a_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    module_id UUID REFERENCES modules(id) ON DELETE SET NULL,
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    a_score DOUBLE PRECISION NOT NULL,
    a_raw DOUBLE PRECISION NOT NULL,
    assignment_count INTEGER NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (topic_id)
);

CREATE INDEX IF NOT EXISTS idx_a_scores_subject
    ON topic_a_scores(subject_id);

ALTER TABLE topic_a_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "a_scores_service_all" ON topic_a_scores;
CREATE POLICY "a_scores_service_all" ON topic_a_scores
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "a_scores_user_read" ON topic_a_scores;
CREATE POLICY "a_scores_user_read" ON topic_a_scores
    FOR SELECT TO authenticated
    USING (
        subject_id IN (
            SELECT id
            FROM subjects
            WHERE user_id = auth.uid()
        )
    );

COMMIT;
