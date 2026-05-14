-- ============================================================================
-- Migration: Add WTF score table
-- Created: 2026-04-12
-- Purpose: Store weighted topic frequency scores per topic
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS topic_wtf_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    module_id UUID REFERENCES modules(id) ON DELETE SET NULL,
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    wtf_score DOUBLE PRECISION NOT NULL,
    wtf_raw DOUBLE PRECISION NOT NULL,
    question_count INTEGER NOT NULL DEFAULT 0,
    paper_count INTEGER NOT NULL DEFAULT 0,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (topic_id)
);

CREATE INDEX IF NOT EXISTS idx_wtf_scores_subject
    ON topic_wtf_scores(subject_id);

ALTER TABLE topic_wtf_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wtf_scores_service_all" ON topic_wtf_scores;
CREATE POLICY "wtf_scores_service_all" ON topic_wtf_scores
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "wtf_scores_user_read" ON topic_wtf_scores;
CREATE POLICY "wtf_scores_user_read" ON topic_wtf_scores
    FOR SELECT TO authenticated
    USING (
        subject_id IN (
            SELECT id
            FROM subjects
            WHERE user_id = auth.uid()
        )
    );

COMMIT;
