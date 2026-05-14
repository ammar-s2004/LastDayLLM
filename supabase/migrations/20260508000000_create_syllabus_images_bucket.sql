-- Create public storage bucket for syllabus image uploads.
-- Applied manually by Ammar through the Supabase migration workflow.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'syllabus-images',
  'syllabus-images',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can upload syllabus images'
  ) THEN
    CREATE POLICY "Authenticated users can upload syllabus images"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'syllabus-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Syllabus images are publicly readable'
  ) THEN
    CREATE POLICY "Syllabus images are publicly readable"
    ON storage.objects FOR SELECT TO public
    USING (bucket_id = 'syllabus-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Service role can delete syllabus images'
  ) THEN
    CREATE POLICY "Service role can delete syllabus images"
    ON storage.objects FOR DELETE TO service_role
    USING (bucket_id = 'syllabus-images');
  END IF;
END $$;

-- Down migration:
-- DROP POLICY IF EXISTS "Service role can delete syllabus images" ON storage.objects;
-- DROP POLICY IF EXISTS "Syllabus images are publicly readable" ON storage.objects;
-- DROP POLICY IF EXISTS "Authenticated users can upload syllabus images" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'syllabus-images';
