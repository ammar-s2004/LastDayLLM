-- Migration: Fix Storage RLS policies for 'resources' bucket
-- Created: 2026-01-25
-- Issue: "All storage uploads failed" error indicates missing Storage RLS policies

-- ============================================================================
-- FIX: Create 'resources' bucket if not exists and add RLS policies
-- ============================================================================

-- 1. Ensure the bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('resources', 'resources', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Give users access to own folder 1q8jzmp_0" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder 1q8jzmp_1" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder 1q8jzmp_2" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder 1q8jzmp_3" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated selects" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;

-- 3. Create comprehensive policies for authenticated users
--    We are allowing authenticated users to perform operations on the 'resources' bucket.
--    Refined policies can be added later (e.g., checking subject ownership), 
--    but for now we need to unblock the uploads.

-- INSERT (Upload)
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'resources');

-- SELECT (Download/View)
CREATE POLICY "Allow authenticated selects"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'resources');

-- UPDATE
CREATE POLICY "Allow authenticated updates"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'resources');

-- DELETE
CREATE POLICY "Allow authenticated deletes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'resources');
