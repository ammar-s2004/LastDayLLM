-- ============================================================================
-- Migration: Add Summary Columns to Notes Metadata
-- Created: 2026-02-15
-- Purpose: Add columns for file-level meta summary and key topics extracted by AI
-- ============================================================================

ALTER TABLE qdrant_notes_metadata 
ADD COLUMN IF NOT EXISTS doc_summary TEXT,
ADD COLUMN IF NOT EXISTS key_topics TEXT[] DEFAULT '{}';

-- Index for key_topics search
CREATE INDEX IF NOT EXISTS idx_qdrant_notes_topics ON qdrant_notes_metadata USING GIN (key_topics);

-- Update RLS if necessary (existing policies usually cover new columns, but good to be aware)
-- The existing policies allow SELECT for authenticated users in the same college, which is fine.
