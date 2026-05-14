# Trash Bin

This folder contains deleted/deprecated code files for reference.

## Previously Contained (Deleted 2026-02-07)
- `process-notes.ts` - Old Supabase-based notes processor
- `upload-notes/route.ts` - Old notes upload API
- `check-notes-duplicates/route.ts` - Old duplicate detection API
- `app-api-auth/` - Old auth callback files
- `app-lib/` - Old lib files

These files were part of the pre-Qdrant notes system and were replaced by:
- `trigger/tasks/process-notes-qdrant.ts`
- `app/api/notes-v2/` APIs
- `lib/qdrant/`, `lib/embeddings/`, `lib/extraction/`

## Note
If you need the old code, check git history before the Qdrant migration.
