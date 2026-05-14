-- ============================================================================
-- Migration: Qdrant RAG Schema
-- Created: 2026-02-07
-- Purpose: Create colleges table and qdrant_notes_metadata for new RAG system
-- ============================================================================

-- ============================================================================
-- 1. Create colleges table
-- ============================================================================
CREATE TABLE IF NOT EXISTS colleges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    short_code TEXT UNIQUE,           -- e.g., "VJTI", "COEP", "IIT-B"
    domain TEXT,                       -- e.g., "vjti.ac.in" for auto-detection
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE colleges ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read colleges
CREATE POLICY "colleges_read_all" ON colleges
    FOR SELECT TO authenticated USING (true);

-- Only service role can insert/update colleges
CREATE POLICY "colleges_service_manage" ON colleges
    FOR ALL TO service_role USING (true);

-- Allow authenticated users to insert new colleges
CREATE POLICY "colleges_user_insert" ON colleges
    FOR INSERT TO authenticated WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_colleges_updated_at
    BEFORE UPDATE ON colleges
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. Add college_id to profiles table
-- ============================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS college_id UUID REFERENCES colleges(id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_college ON profiles(college_id);

-- ============================================================================
-- 3. Add college_id to subjects table
-- ============================================================================
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS college_id UUID REFERENCES colleges(id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_subjects_college ON subjects(college_id);

-- ============================================================================
-- 4. Create qdrant_notes_metadata table
-- ============================================================================
CREATE TABLE IF NOT EXISTS qdrant_notes_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Qdrant reference
    qdrant_collection TEXT NOT NULL DEFAULT 'notes',
    qdrant_point_ids UUID[] NOT NULL,  -- Array of Qdrant point IDs
    
    -- Ownership & context
    college_id UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    uploader_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- File metadata
    original_filename TEXT NOT NULL,
    file_type TEXT NOT NULL,           -- 'pdf', 'ppt', 'pptx', 'doc'
    teacher_name TEXT,
    storage_path TEXT,                 -- Supabase storage path (optional)
    
    -- Processing info
    chunk_count INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER,
    processing_status TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING, PROCESSING, COMPLETED, FAILED
    error_message TEXT,
    
    -- Deduplication & retention
    is_best_collection BOOLEAN DEFAULT false,  -- True = keeper, False = can be deleted
    content_hash TEXT,                         -- For quick dedup check
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ,            -- When to auto-delete (null = never)
    deleted_at TIMESTAMPTZ             -- Soft delete timestamp
);

-- Enable RLS
ALTER TABLE qdrant_notes_metadata ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "qdrant_notes_service_all" ON qdrant_notes_metadata
    FOR ALL TO service_role USING (true);

-- Users can view notes from their college
CREATE POLICY "qdrant_notes_read_college" ON qdrant_notes_metadata
    FOR SELECT TO authenticated
    USING (
        deleted_at IS NULL AND
        college_id IN (SELECT college_id FROM profiles WHERE id = auth.uid())
    );

-- Users can insert their own notes
CREATE POLICY "qdrant_notes_user_insert" ON qdrant_notes_metadata
    FOR INSERT TO authenticated
    WITH CHECK (uploader_id = auth.uid());

-- Users can update their own notes
CREATE POLICY "qdrant_notes_user_update" ON qdrant_notes_metadata
    FOR UPDATE TO authenticated
    USING (uploader_id = auth.uid());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_qdrant_notes_college ON qdrant_notes_metadata(college_id);
CREATE INDEX IF NOT EXISTS idx_qdrant_notes_subject ON qdrant_notes_metadata(subject_id);
CREATE INDEX IF NOT EXISTS idx_qdrant_notes_uploader ON qdrant_notes_metadata(uploader_id);
CREATE INDEX IF NOT EXISTS idx_qdrant_notes_expires ON qdrant_notes_metadata(expires_at) 
    WHERE deleted_at IS NULL AND expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qdrant_notes_hash ON qdrant_notes_metadata(content_hash);
CREATE INDEX IF NOT EXISTS idx_qdrant_notes_best ON qdrant_notes_metadata(college_id, subject_id, is_best_collection)
    WHERE deleted_at IS NULL;

-- Trigger for updated_at
CREATE TRIGGER update_qdrant_notes_updated_at
    BEFORE UPDATE ON qdrant_notes_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- End of Migration
-- ============================================================================
