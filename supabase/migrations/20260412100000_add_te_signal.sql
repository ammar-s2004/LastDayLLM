-- ============================================================================
-- Migration: Add TE signal schema
-- Created: 2026-04-12
-- Purpose: Add teacher hint confidence and store teacher emphasis scores
-- ============================================================================

BEGIN;

ALTER TABLE teacher_hints
    ADD COLUMN IF NOT EXISTS confidence TEXT NOT NULL DEFAULT 'EXACT',
    DROP CONSTRAINT IF EXISTS teacher_hints_confidence_check,
    ADD CONSTRAINT teacher_hints_confidence_check
        CHECK (confidence IN ('EXACT', 'VAGUE', 'INFERRED'));

CREATE TABLE IF NOT EXISTS topic_te_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    module_id UUID REFERENCES modules(id) ON DELETE SET NULL,
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    te_score DOUBLE PRECISION NOT NULL,
    te_raw DOUBLE PRECISION NOT NULL,
    reason TEXT,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (topic_id)
);

CREATE INDEX IF NOT EXISTS idx_te_scores_subject
    ON topic_te_scores(subject_id);

ALTER TABLE topic_te_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "te_scores_service_all" ON topic_te_scores;
CREATE POLICY "te_scores_service_all" ON topic_te_scores
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "te_scores_user_read" ON topic_te_scores;
CREATE POLICY "te_scores_user_read" ON topic_te_scores
    FOR SELECT TO authenticated
    USING (
        subject_id IN (
            SELECT id
            FROM subjects
            WHERE user_id = auth.uid()
        )
    );

COMMIT;
