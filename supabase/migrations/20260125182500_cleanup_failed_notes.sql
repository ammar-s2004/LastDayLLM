-- Cleanup Migration: Remove orphaned storage files and failed records
-- Created: 2026-01-25

-- 1. Create a function to cleanup usage (optional, usually handled via cron/edge function)
--    For now, this SQL focuses on cleaning the tables.
--    Cleaning ACTUAL storage files via SQL is hard because they are separate systems.
--    However, we can delete the 'note_resources' marked as FAILED.
--    The storage files will be overwritten on next upload, so space isn't permanently lost 
--    if the filenames are the same.
--    But for TRUE cleanup of storage, we need an Edge Function.

--    Step A: Delete FAILED records from database
DELETE FROM note_resources WHERE status = 'FAILED';

--    Step B: (Optional) Delete resources older than 24h that are still PROCESSING (stuck)
DELETE FROM note_resources 
WHERE status = 'PROCESSING' 
AND created_at < NOW() - INTERVAL '24 hours';

--    If you want to clean Storage Objects that have no database reference:
--    This requires a complex query joining storage.objects and note_resources.
--    Supabase Storage is a separate schema.

--    Simplified Cleanup for now:
--    Just remove the failed metadata so the UI is clean.
