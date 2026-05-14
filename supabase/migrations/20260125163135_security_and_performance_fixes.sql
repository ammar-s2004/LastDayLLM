-- Database Migration: Security & Performance Fixes (Detailed)
-- Created: 2026-01-25T16:33
-- 
-- DESCRIPTION:
-- This migration file addresses specific security vulnerabilities and performance issues
-- identified by the Supabase Database Linter. It creates no new logic, only hardens existing objects.

-- ============================================================================
-- 1. SECURITY FIX: View Permissions (SECURITY DEFINER vs INVOKER)
-- ============================================================================
-- THE ISSUE: 
-- The view `subject_resource_limits` was created with `SECURITY DEFINER`.
-- This is dangerous because it executes with the privileges of the view's CREATOR (often an admin),
-- completely bypassing Row Level Security (RLS) policies for the user querying it.
-- This could allow a user to see data they shouldn't access.

-- THE FIX:
-- We recreate the view with `SECURITY INVOKER`.
-- This ensures the view executes with the privileges of the USER querying it,
-- so RLS policies are correctly checked and enforced.

DROP VIEW IF EXISTS public.subject_resource_limits;

CREATE VIEW public.subject_resource_limits AS
SELECT 
    subject_id,
    count(*) FILTER (WHERE resource_type = 'SYLLABUS'::resource_type AND status <> 'FAILED'::resource_status) AS syllabus_count,
    count(*) FILTER (WHERE resource_type = 'TEST_PAPER'::resource_type AND status <> 'FAILED'::resource_status) AS test_paper_count,
    count(*) FILTER (WHERE resource_type = 'ASSIGNMENT'::resource_type AND status <> 'FAILED'::resource_status) AS assignment_count
FROM resources
GROUP BY subject_id;

-- Explicitly enable SECURITY INVOKER for safety
ALTER VIEW public.subject_resource_limits SET (security_invoker = true);

COMMENT ON VIEW public.subject_resource_limits IS 'Aggregates resource counts per subject. Uses SECURITY INVOKER for proper RLS enforcement.';


-- ============================================================================
-- 2. SECURITY FIX: Mutable Search Paths in Functions
-- ============================================================================
-- THE ISSUE:
-- Postgres functions default to a mutable `search_path`. If an attacker can create objects
-- in a schema that is searched before `public` (or if `public` is writable), they can
-- "hijack" function calls. For example, creating a malicious `now()` function effectively
-- trojan-horses your code.

-- THE FIX:
-- We explicity set `SET search_path = public` on these functions.
-- This restricts the function to only look in the `public` schema for other objects,
-- preventing this class of injection attacks.

-- 2a. Fix `increment_subject_resource_count`
-- (This function is legacy/no-op, but we secure it anyway to silence the warning)
-- NOTE: We must match the existing signature EXACTLY (including defaults) to REPLACE it.
CREATE OR REPLACE FUNCTION public.increment_subject_resource_count(
    p_subject_id UUID,
    p_resource_type TEXT,
    p_increment_by INTEGER DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER        -- Ensure it respects caller permissions
SET search_path = public -- LOCK DOWN the search path
AS $$
BEGIN 
  RETURN; -- No-op, view auto-calculates
END; 
$$;

-- 2b. Fix `update_updated_at_column`
-- This is a very common trigger function that runs on every update.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public -- LOCK DOWN the search path
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 2c. Fix `save_module_with_topics_secure`
-- We use dynamic SQL in a DO block to fix this one safely without needing its full body definition.
DO $$
BEGIN
    -- We simply alter the existing function to lock its search path
    EXECUTE 'ALTER FUNCTION public.save_module_with_topics_secure SET search_path = public';
EXCEPTION
    WHEN undefined_function THEN
        RAISE NOTICE 'Function save_module_with_topics_secure not found, skipping.';
    WHEN others THEN
        RAISE NOTICE 'Could not alter save_module_with_topics_secure: %', SQLERRM;
END;
$$;


-- ============================================================================
-- 3. PERFORMANCE FIX: Duplicate Indexes on prediction_runs
-- ============================================================================
-- THE ISSUE:
-- The `prediction_runs` table has duplicate indexes:
-- - `idx_prediction_runs_subject_id` AND `prediction_runs_subject_id_idx`
-- - `idx_prediction_runs_user_id` AND `prediction_runs_user_id_idx`
--
-- Why is this bad?
-- - SLOWER WRITES: Every INSERT/UPDATE must update BOTH indexes.
-- - WASTED SPACE: Double disk space and RAM for caching.

-- THE FIX:
-- Drop the duplicate indexes (keeping the ones with consistent naming).

-- NOTE: We are NOT dropping `modules_subject_id_index_no_key` because investigation
-- revealed it's a UNIQUE constraint on (subject_id, module_no), not a duplicate index.
-- This is intentional business logic to prevent duplicate module numbers per subject.

DROP INDEX IF EXISTS public.prediction_runs_subject_id_idx;
DROP INDEX IF EXISTS public.prediction_runs_user_id_idx;


-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
