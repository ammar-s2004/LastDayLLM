-- ============================================================================
-- Migration: Drop Old Notes System
-- Created: 2026-02-07
-- Purpose: Remove legacy Supabase-based notes storage in preparation for Qdrant
-- ============================================================================

-- WARNING: This is a destructive migration. All notes data will be lost.
-- The new system uses Qdrant vector database for notes storage.

-- ============================================================================
-- 1. Drop RLS Policies first
-- ============================================================================
DROP POLICY IF EXISTS "notes_read_policy" ON note_resources;
DROP POLICY IF EXISTS "chunks_read_policy" ON note_chunks;
DROP POLICY IF EXISTS "mentions_read_policy" ON note_topic_mentions;

-- Additional policies from fix_notes_rls_policies migration
DROP POLICY IF EXISTS "users_can_view_own_subject_notes" ON note_resources;
DROP POLICY IF EXISTS "users_can_manage_own_subject_notes" ON note_resources;
DROP POLICY IF EXISTS "service_can_manage_notes" ON note_resources;
DROP POLICY IF EXISTS "service_can_manage_chunks" ON note_chunks;
DROP POLICY IF EXISTS "service_can_manage_mentions" ON note_topic_mentions;

-- ============================================================================
-- 2. Drop Triggers
-- ============================================================================
DROP TRIGGER IF EXISTS update_note_resources_updated_at ON note_resources;

-- ============================================================================
-- 3. Drop Tables (order matters due to foreign keys)
-- ============================================================================
DROP TABLE IF EXISTS note_topic_mentions CASCADE;
DROP TABLE IF EXISTS note_chunks CASCADE;
DROP TABLE IF EXISTS note_resources CASCADE;

-- ============================================================================
-- 4. Drop Custom Types
-- ============================================================================
DROP TYPE IF EXISTS note_status_type;
DROP TYPE IF EXISTS note_chunk_type;

-- ============================================================================
-- 5. Cleanup: Remove any orphaned storage policies for notes
-- ============================================================================
-- Note: Storage bucket 'notes' can be cleaned manually if needed

-- ============================================================================
-- End of Migration
-- ============================================================================
