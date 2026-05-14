-- Migration: Fix RLS policies for note tables
-- Created: 2026-01-25
-- Issue: INSERT, UPDATE, DELETE policies were missing, causing upload failures

-- ============================================================================
-- FIX: Add missing INSERT/UPDATE/DELETE policies for note_resources
-- ============================================================================

-- Drop existing policy (if it exists) and recreate with proper access
DROP POLICY IF EXISTS "notes_insert_policy" ON note_resources;
DROP POLICY IF EXISTS "notes_update_policy" ON note_resources;
DROP POLICY IF EXISTS "notes_delete_policy" ON note_resources;

-- INSERT: Allow inserting notes for modules that belong to user's subjects
CREATE POLICY "notes_insert_policy" ON note_resources 
FOR INSERT TO authenticated 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM modules m
        JOIN subjects s ON m.subject_id = s.id
        WHERE m.id = note_resources.module_id
        AND s.user_id = auth.uid()
    )
);

-- UPDATE: Allow updating notes for modules that belong to user's subjects
CREATE POLICY "notes_update_policy" ON note_resources 
FOR UPDATE TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM modules m
        JOIN subjects s ON m.subject_id = s.id
        WHERE m.id = note_resources.module_id
        AND s.user_id = auth.uid()
    )
);

-- DELETE: Allow deleting notes for modules that belong to user's subjects
CREATE POLICY "notes_delete_policy" ON note_resources 
FOR DELETE TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM modules m
        JOIN subjects s ON m.subject_id = s.id
        WHERE m.id = note_resources.module_id
        AND s.user_id = auth.uid()
    )
);

-- ============================================================================
-- FIX: Add missing INSERT/UPDATE/DELETE policies for note_chunks
-- ============================================================================

DROP POLICY IF EXISTS "chunks_insert_policy" ON note_chunks;
DROP POLICY IF EXISTS "chunks_update_policy" ON note_chunks;
DROP POLICY IF EXISTS "chunks_delete_policy" ON note_chunks;

-- INSERT: Allow inserting chunks for notes that belong to user's subjects
CREATE POLICY "chunks_insert_policy" ON note_chunks 
FOR INSERT TO authenticated 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM note_resources nr
        JOIN modules m ON nr.module_id = m.id
        JOIN subjects s ON m.subject_id = s.id
        WHERE nr.id = note_chunks.note_id
        AND s.user_id = auth.uid()
    )
);

-- UPDATE: Allow updating chunks for notes that belong to user's subjects  
CREATE POLICY "chunks_update_policy" ON note_chunks 
FOR UPDATE TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM note_resources nr
        JOIN modules m ON nr.module_id = m.id
        JOIN subjects s ON m.subject_id = s.id
        WHERE nr.id = note_chunks.note_id
        AND s.user_id = auth.uid()
    )
);

-- DELETE: Allow deleting chunks for notes that belong to user's subjects
CREATE POLICY "chunks_delete_policy" ON note_chunks 
FOR DELETE TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM note_resources nr
        JOIN modules m ON nr.module_id = m.id
        JOIN subjects s ON m.subject_id = s.id
        WHERE nr.id = note_chunks.note_id
        AND s.user_id = auth.uid()
    )
);

-- ============================================================================
-- FIX: Add missing INSERT/UPDATE/DELETE policies for note_topic_mentions
-- ============================================================================

DROP POLICY IF EXISTS "mentions_insert_policy" ON note_topic_mentions;
DROP POLICY IF EXISTS "mentions_update_policy" ON note_topic_mentions;
DROP POLICY IF EXISTS "mentions_delete_policy" ON note_topic_mentions;

-- INSERT policy
CREATE POLICY "mentions_insert_policy" ON note_topic_mentions 
FOR INSERT TO authenticated 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM note_resources nr
        JOIN modules m ON nr.module_id = m.id
        JOIN subjects s ON m.subject_id = s.id
        WHERE nr.id = note_topic_mentions.note_id
        AND s.user_id = auth.uid()
    )
);

-- UPDATE policy
CREATE POLICY "mentions_update_policy" ON note_topic_mentions 
FOR UPDATE TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM note_resources nr
        JOIN modules m ON nr.module_id = m.id
        JOIN subjects s ON m.subject_id = s.id
        WHERE nr.id = note_topic_mentions.note_id
        AND s.user_id = auth.uid()
    )
);

-- DELETE policy
CREATE POLICY "mentions_delete_policy" ON note_topic_mentions 
FOR DELETE TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM note_resources nr
        JOIN modules m ON nr.module_id = m.id
        JOIN subjects s ON m.subject_id = s.id
        WHERE nr.id = note_topic_mentions.note_id
        AND s.user_id = auth.uid()
    )
);
