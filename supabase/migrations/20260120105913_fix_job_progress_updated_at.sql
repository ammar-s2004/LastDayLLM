/* ============================================================================
   MIGRATION: Fix missing updated_at columns
   ============================================================================
   
   FILE: supabase/migrations/20260120105913_fix_job_progress_updated_at.sql
   CREATED: 2026-01-20
   
   ============================================================================
   PURPOSE
   ============================================================================
   
   Fixes the error: `record "new" has no field "updated_at"`
   
   The `resources` and `job_progress` tables have triggers that call
   `update_updated_at_column()`, but the tables are missing the `updated_at`
   column that the trigger expects to update.
   
============================================================================ */

BEGIN;

-- Add updated_at to resources (required by resources_updated_at trigger)
ALTER TABLE public.resources 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add updated_at to job_progress (required by job_progress_updated_at trigger)
ALTER TABLE public.job_progress 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

COMMIT;
