-- ============================================================================
-- Migration: add_answer_diagram_columns
-- Date: 2026-05-16
-- Part of: Answer Generation Module (Phase 1)
--
-- Adds 5 nullable columns to generated_questions to support:
--   - AI-generated Mermaid diagrams for answers
--   - PDF page references (signed URL + page anchor)
--   - External web links to canonical diagrams
--   - Student-uploaded screenshots for persistence
-- ============================================================================

ALTER TABLE public.generated_questions
  ADD COLUMN IF NOT EXISTS answer_diagram_type       text
    CHECK (answer_diagram_type IN ('MERMAID', 'PDF_PAGE', 'WEB_LINK', 'NONE')),
  ADD COLUMN IF NOT EXISTS answer_diagram_mermaid    text,
  ADD COLUMN IF NOT EXISTS answer_diagram_web_url    text,
  ADD COLUMN IF NOT EXISTS answer_diagram_page_ref   jsonb,
  ADD COLUMN IF NOT EXISTS answer_diagram_screenshot_url text;

COMMENT ON COLUMN public.generated_questions.answer_diagram_type IS
  'Type of diagram for the answer: MERMAID | PDF_PAGE | WEB_LINK | NONE. Null = not yet generated.';
COMMENT ON COLUMN public.generated_questions.answer_diagram_mermaid IS
  'Raw Mermaid syntax for MERMAID type answer diagrams. Single-line string with \n separators.';
COMMENT ON COLUMN public.generated_questions.answer_diagram_web_url IS
  'External URL for WEB_LINK type answer diagrams (Wikipedia, GeeksForGeeks, etc.)';
COMMENT ON COLUMN public.generated_questions.answer_diagram_page_ref IS
  'JSONB: {storage_path: string, page: number, filename: string}. For PDF_PAGE type — references the source PDF page in Supabase Storage.';
COMMENT ON COLUMN public.generated_questions.answer_diagram_screenshot_url IS
  'Student-uploaded screenshot URL. Stored in resources bucket at diagrams/{subject_id}/{question_id}.png. Persists even if source PDF is deleted.';
