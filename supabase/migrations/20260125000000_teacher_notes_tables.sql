-- Database Migration: Teacher Notes Tables
-- Created: 2026-01-25

-- 1. Create Status Enum (includes PARTIAL for flagged files)
DO $$ BEGIN
    CREATE TYPE note_status_type AS ENUM ('UPLOADING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Chunk Type Enum
DO $$ BEGIN
    CREATE TYPE note_chunk_type AS ENUM ('definition', 'formula', 'example', 'theorem', 'concept');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Create note_resources table
CREATE TABLE IF NOT EXISTS note_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    content_hash TEXT,  -- SHA-256 hash for duplicate detection
    status note_status_type NOT NULL DEFAULT 'UPLOADING',
    warning_message TEXT,  -- Shown when status is PARTIAL
    summary TEXT,
    key_concepts TEXT[],
    page_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create note_chunks table
CREATE TABLE IF NOT EXISTS note_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES note_resources(id) ON DELETE CASCADE,
    chunk_no INTEGER NOT NULL,
    content TEXT NOT NULL,
    chunk_type note_chunk_type NOT NULL,
    importance FLOAT NOT NULL DEFAULT 0.0,
    page_num INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create note_topic_mentions table
CREATE TABLE IF NOT EXISTS note_topic_mentions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES note_resources(id) ON DELETE CASCADE,
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    mention_count INTEGER NOT NULL DEFAULT 0,
    emphasis_score FLOAT NOT NULL DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_note_resources_subject ON note_resources(subject_id);
CREATE INDEX IF NOT EXISTS idx_note_resources_module ON note_resources(module_id);
CREATE INDEX IF NOT EXISTS idx_note_resources_hash ON note_resources(content_hash);
CREATE INDEX IF NOT EXISTS idx_note_chunks_note ON note_chunks(note_id);
CREATE INDEX IF NOT EXISTS idx_note_topic_mentions_note ON note_topic_mentions(note_id);
CREATE INDEX IF NOT EXISTS idx_note_topic_mentions_topic ON note_topic_mentions(topic_id);

-- 7. Add triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_note_resources_updated_at
    BEFORE UPDATE ON note_resources
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 8. Enable RLS
ALTER TABLE note_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_topic_mentions ENABLE ROW LEVEL SECURITY;

-- 9. Basic RLS Policies (Assuming standard user access patterns)
-- For now, allowing all authenticated users to read.
-- Specific policies should be refined as per app requirements.
CREATE POLICY "notes_read_policy" ON note_resources FOR SELECT TO authenticated USING (true);
CREATE POLICY "chunks_read_policy" ON note_chunks FOR SELECT TO authenticated USING (true);
CREATE POLICY "mentions_read_policy" ON note_topic_mentions FOR SELECT TO authenticated USING (true);
