-- ============================================================================
-- Migration: Add NC tables and page count to notes metadata
-- Created: 2026-04-01
-- Purpose: Store notes coverage scores and topic coverage maps per uploaded file
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS nc_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    module_id UUID REFERENCES modules(id) ON DELETE SET NULL,
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    note_file_id UUID NOT NULL REFERENCES qdrant_notes_metadata(id) ON DELETE CASCADE,
    nc_file_score DOUBLE PRECISION NOT NULL,
    file_weight DOUBLE PRECISION NOT NULL,
    depth_breakdown JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (topic_id, note_file_id)
);

CREATE INDEX IF NOT EXISTS idx_nc_scores_subject
    ON nc_scores(subject_id);

CREATE INDEX IF NOT EXISTS idx_nc_scores_note_file
    ON nc_scores(note_file_id);

ALTER TABLE nc_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nc_scores_service_all" ON nc_scores;
CREATE POLICY "nc_scores_service_all" ON nc_scores
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "nc_scores_user_read_own_subjects" ON nc_scores;
CREATE POLICY "nc_scores_user_read_own_subjects" ON nc_scores
    FOR SELECT TO authenticated
    USING (
        subject_id IN (
            SELECT id
            FROM subjects
            WHERE user_id = auth.uid()
        )
    );

CREATE TABLE IF NOT EXISTS nc_topic_map (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    module_id UUID REFERENCES modules(id) ON DELETE SET NULL,
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    note_file_id UUID NOT NULL REFERENCES qdrant_notes_metadata(id) ON DELETE CASCADE,
    subtopics_covered TEXT[] NOT NULL DEFAULT '{}',
    not_covered TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (topic_id, note_file_id)
);

CREATE INDEX IF NOT EXISTS idx_nc_topic_map_subject
    ON nc_topic_map(subject_id);

CREATE INDEX IF NOT EXISTS idx_nc_topic_map_note_file
    ON nc_topic_map(note_file_id);

ALTER TABLE nc_topic_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nc_topic_map_service_all" ON nc_topic_map;
CREATE POLICY "nc_topic_map_service_all" ON nc_topic_map
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "nc_topic_map_user_read_own_subjects" ON nc_topic_map;
CREATE POLICY "nc_topic_map_user_read_own_subjects" ON nc_topic_map
    FOR SELECT TO authenticated
    USING (
        subject_id IN (
            SELECT id
            FROM subjects
            WHERE user_id = auth.uid()
        )
    );

ALTER TABLE qdrant_notes_metadata
    ADD COLUMN IF NOT EXISTS page_count INTEGER;

COMMIT;
