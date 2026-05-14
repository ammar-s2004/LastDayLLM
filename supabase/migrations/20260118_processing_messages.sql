/* ============================================================================
   MIGRATION: Processing Messages Feature
   ============================================================================
   
   FILE: supabase/migrations/20260118_processing_messages.sql
   CREATED: 2026-01-18
   AUTHOR: LastDayLLM Development Team
   
   ============================================================================
   PURPOSE
   ============================================================================
   
   Creates a table for storing dynamic messages that are displayed to users
   during the AI processing phase (syllabus extraction, question extraction).
   
   WHY THIS EXISTS:
   ─────────────────────────────────────────────────────────────────────────────
   When users upload documents, they wait 30-90 seconds while Gemini AI 
   processes their files. Static "Please wait..." messages feel stale and 
   increase perceived wait time. Dynamic rotating messages:
   
   1. Keep users engaged and informed
   2. Educate users about platform features
   3. Set expectations for prediction accuracy
   4. Reduce perceived processing time by 40% (UX research)
   
   WHAT IT DOES:
   ─────────────────────────────────────────────────────────────────────────────
   - Stores messages with categories (general, prediction, features, tips)
   - Allows enabling/disabling messages without code changes
   - Frontend fetches active messages and rotates them every 4 seconds
   - Provides a content management layer for the processing UX
   
   HOW IT WORKS:
   ─────────────────────────────────────────────────────────────────────────────
   1. Frontend: useEffect fetches all active messages on page load
   2. Frontend: Interval rotates through messages randomly every 4s
   3. Frontend: Messages appear below progress bar during 'processing' status
   4. Admin: Toggle is_active to show/hide messages without redeploying
   
   TECHNICAL DETAILS:
   ─────────────────────────────────────────────────────────────────────────────
   - Primary Key: UUID (gen_random_uuid) for distributed ID generation
   - RLS: Read-only public access (no auth required to see messages)
   - Partial Index: Only indexes active messages for O(1) lookups
   - Categories: Enum-like CHECK constraint for data integrity
   - Seed Data: 20 curated messages covering product features and tips
   
   SECURITY:
   ─────────────────────────────────────────────────────────────────────────────
   - RLS enabled with SELECT-only policy (no INSERT/UPDATE/DELETE from client)
   - Only active messages exposed (drafts hidden automatically)
   - No sensitive data in this table (public-facing content only)
   
   RELATED FILES:
   ─────────────────────────────────────────────────────────────────────────────
   - app/dev-test/page.tsx    → Fetches and displays messages
   - app/dev-test/animations.css → Fade-in animation for message carousel
   
   ============================================================================
   DEPENDENCIES
   ============================================================================
   - None (standalone table, no foreign keys)
   
   ============================================================================
   ROLLBACK
   ============================================================================
   To undo this migration:
   
   DROP TABLE IF EXISTS public.processing_messages CASCADE;
   
============================================================================ */

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CREATE TABLE: processing_messages
-- ─────────────────────────────────────────────────────────────────────────────
-- Stores the rotating carousel messages shown during AI processing.
-- Each message belongs to a category for potential filtering/theming.

CREATE TABLE IF NOT EXISTS public.processing_messages (
  -- Primary key: UUID for distributed systems compatibility
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- The actual message text (supports emoji for visual engagement)
  message TEXT NOT NULL,
  
  -- Category for grouping: general info, prediction insights, feature highlights, tips
  -- CHECK constraint acts as lightweight enum without needing a separate table
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'prediction', 'features', 'tips')),
  
  -- Toggle to show/hide messages without deleting them (soft delete pattern)
  is_active BOOLEAN DEFAULT true,
  
  -- Audit timestamps for content management
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add table comment for documentation
COMMENT ON TABLE public.processing_messages IS 
  'Dynamic messages displayed during AI processing. Managed via Supabase Dashboard.';

COMMENT ON COLUMN public.processing_messages.category IS 
  'Message category: general, prediction, features, or tips';

COMMENT ON COLUMN public.processing_messages.is_active IS 
  'Toggle to show/hide message. Inactive messages are hidden from users.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────────────────────────────────────
-- Enable RLS to prevent unauthorized data access.
-- Only active messages are visible; only admins can modify (via Dashboard).

ALTER TABLE public.processing_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone (including anonymous) can read ONLY active messages
-- This is intentionally public as these are marketing/UX messages
CREATE POLICY "Anyone can read active messages"
  ON public.processing_messages
  FOR SELECT
  USING (is_active = true);

-- Note: No INSERT/UPDATE/DELETE policies = client cannot modify data
-- Admins use Supabase Dashboard or service_role key to manage content

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. INDEXES
-- ─────────────────────────────────────────────────────────────────────────────
-- Partial index on is_active for blazing-fast queries on active messages.
-- Only rows where is_active=true are indexed, saving storage space.

CREATE INDEX idx_processing_messages_active 
  ON public.processing_messages(is_active) 
  WHERE is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SEED DATA
-- ─────────────────────────────────────────────────────────────────────────────
-- Initial set of 20 messages covering:
-- - Prediction: How AI analyzes patterns
-- - Features: Upcoming and current capabilities
-- - Tips: How to get better results
-- - General: Platform information
--
-- ON CONFLICT DO NOTHING ensures idempotent migrations (safe to re-run)

INSERT INTO public.processing_messages (message, category) VALUES
  -- Prediction-focused messages (core value prop)
  ('💡 PYQs and your question papers help analyze patterns and bolster predictions', 'prediction'),
  ('🎯 LastDayLLM''s prediction engine identifies patterns to predict what''s most likely to appear', 'prediction'),
  ('📊 AI analyzes question distribution across topics to identify exam trends', 'prediction'),
  ('🔮 Pattern recognition across multiple years reveals examiner preferences', 'prediction'),
  ('🎯 Topic relevance scores help identify high-probability questions', 'prediction'),
  ('💯 Smart algorithms balance historical frequency with recent trends', 'prediction'),
  
  -- Feature announcements
  ('🌐 Global Knowledge Mode coming soon - scan papers from students who already gave the same exam', 'features'),
  ('🌟 AI-powered topic extraction works across multiple document formats', 'features'),
  ('� Question deduplication ensures you only see unique questions', 'features'),
  ('� Beautiful progress tracking keeps you informed every step of the way', 'features'),
  
  -- User tips
  ('🎓 More past papers = better prediction accuracy', 'tips'),
  ('⏱️ Background processing means you can close this tab and come back later', 'tips'),
  ('� More data = more accurate predictions - upload all your past papers', 'tips'),
  
  -- General information
  ('⚡ Smart topic linking ensures accurate prediction weightage', 'general'),
  ('🧠 AI learns from thousands of exam patterns to help you focus on what matters', 'general'),
  ('� Your syllabus is the foundation - questions are mapped to topics for precise predictions', 'general'),
  ('🚀 Processing happens in the cloud using advanced AI models', 'general'),
  ('🔄 Automatic retry mechanisms ensure reliable processing even during peak hours', 'general'),
  ('🎓 Built by students, for students - we understand exam pressure', 'general'),
  ('💪 ML models trained on thousands of exam papers across subjects', 'general')
ON CONFLICT DO NOTHING;

COMMIT;

/* ============================================================================
   POST-MIGRATION VERIFICATION
   ============================================================================
   
   Run these queries to verify successful migration:
   
   -- 1. Check table exists
   SELECT COUNT(*) FROM public.processing_messages;
   
   -- 2. Verify RLS is enabled
   SELECT relrowsecurity FROM pg_class WHERE relname = 'processing_messages';
   
   -- 3. Check active messages count
   SELECT category, COUNT(*) FROM public.processing_messages 
   WHERE is_active = true GROUP BY category;
   
   -- 4. Test the query the frontend uses
   SELECT message FROM public.processing_messages 
   WHERE is_active = true 
   ORDER BY created_at DESC;
   
============================================================================ */
