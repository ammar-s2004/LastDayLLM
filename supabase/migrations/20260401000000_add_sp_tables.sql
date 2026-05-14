-- ============================================================================
-- Migration: Add SP score table
-- Created: 2026-04-01
-- Purpose: Store syllabus prior centrality scores per topic
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS topic_sp_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    centrality_score DOUBLE PRECISION NOT NULL CHECK (centrality_score >= 0.0 AND centrality_score <= 1.0),
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (topic_id)
);

CREATE INDEX IF NOT EXISTS idx_sp_scores_subject
    ON topic_sp_scores(subject_id);

CREATE INDEX IF NOT EXISTS idx_sp_scores_module
    ON topic_sp_scores(module_id);

ALTER TABLE topic_sp_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "topic_sp_scores_service_all" ON topic_sp_scores;
CREATE POLICY "topic_sp_scores_service_all" ON topic_sp_scores
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "topic_sp_scores_user_read_own_subjects" ON topic_sp_scores;
CREATE POLICY "topic_sp_scores_user_read_own_subjects" ON topic_sp_scores
    FOR SELECT TO authenticated
    USING (
        subject_id IN (
            SELECT id
            FROM subjects
            WHERE user_id = auth.uid()
        )
    );

COMMIT;
