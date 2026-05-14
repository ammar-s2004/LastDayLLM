-- ============================================================================
-- MIGRATION: Database Constraints for Data Integrity
-- Created: 2025-01-01
-- Author: LastDayLLM Team
-- ============================================================================
--
-- PURPOSE:
-- --------
-- This migration adds essential constraints to ensure data integrity across
-- the application. Constraints act as the "last line of defense" against
-- invalid data, even if application-level validation fails.
--
-- TECHNICAL ROLE:
-- ---------------
-- These constraints enforce business rules at the database level:
--   1. State machine safety - Only valid status transitions allowed
--   2. Idempotency - Prevent duplicate entries that break upsert logic
--   3. Uniqueness - Ensure business keys remain unique
--
-- DATABASE ROLE:
-- --------------
-- - CHECK constraints validate column values
-- - UNIQUE constraints prevent duplicate rows
-- - Partial indexes optimize queries on filtered data
--
-- APP INTEGRATION:
-- ----------------
-- These constraints work with the following app components:
--
-- | Constraint                      | Used By                          |
-- |---------------------------------|----------------------------------|
-- | resources_status_check          | process-document.ts state machine|
-- | modules_subject_module_unique   | syllabus extraction (AI pipeline)|
-- | topics_module_name_unique       | topic upsert during processing   |
-- | job_progress_job_stage_unique   | Trigger.dev progress tracking    |
-- | idx_resources_status_active     | Resource claim queries           |
--
-- WHAT HAPPENS WITHOUT THESE:
-- ---------------------------
-- - resources_status_check: Could have status='BANANA' in database
-- - modules_subject_module_unique: Same module_no twice per subject
-- - topics_module_name_unique: Duplicate topics in same module
-- - job_progress_job_stage_unique: Multiple progress rows per stage
--
-- ============================================================================

BEGIN;

-- =====================================================
-- 1. ENSURE VALID RESOURCE STATUS VALUES
-- =====================================================
-- Prevent invalid or mistyped statuses (state machine safety)
-- The app uses these exact statuses in process-document.ts:
--   UPLOADING -> PROCESSING -> COMPLETED/FAILED

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'resources_status_check'
  ) THEN
    ALTER TABLE resources
    ADD CONSTRAINT resources_status_check
    CHECK (status IN ('UPLOADING', 'PROCESSING', 'COMPLETED', 'FAILED'));
  END IF;
END $$;

-- =====================================================
-- 2. PREVENT DUPLICATE MODULES (IDEMPOTENCY)
-- =====================================================
-- One module number per subject, forever

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'modules_subject_module_unique'
  ) THEN
    ALTER TABLE modules
    ADD CONSTRAINT modules_subject_module_unique
    UNIQUE (subject_id, module_no);
  END IF;
END $$;

-- =====================================================
-- 3. PREVENT DUPLICATE TOPICS PER MODULE
-- =====================================================
-- Same topic name allowed in different modules, not same one

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'topics_module_name_unique'
  ) THEN
    ALTER TABLE topics
    ADD CONSTRAINT topics_module_name_unique
    UNIQUE (module_id, name);
  END IF;
END $$;

-- =====================================================
-- 4. PREVENT DUPLICATE JOB PROGRESS ROWS
-- =====================================================
-- One row per (job_id, stage)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_progress_job_stage_unique'
  ) THEN
    ALTER TABLE job_progress
    ADD CONSTRAINT job_progress_job_stage_unique
    UNIQUE (job_id, stage);
  END IF;
END $$;

-- =====================================================
-- 5. INDEX FOR ATOMIC RESOURCE CLAIM
-- =====================================================
-- Speeds up:
-- UPDATE resources SET status='PROCESSING'
-- WHERE id=? AND status='UPLOADING'

CREATE INDEX IF NOT EXISTS idx_resources_status_active
ON resources(status)
WHERE status IN ('UPLOADING', 'PROCESSING');

COMMIT;
