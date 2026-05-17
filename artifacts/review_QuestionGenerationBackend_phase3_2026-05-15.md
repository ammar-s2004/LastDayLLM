Review — Phase 3: Question Generation Backend Engine
Date: 2026-05-15
Status: NEEDS FIXES

Summary
Codex implemented all three deliverables correctly: the Trigger.dev task (`generate-questions.ts`), the API route (`app/api/generate-questions/route.ts`), and the `trigger/index.ts` export. The overall architecture is solid — data fetching, prompt construction, schema-enforced LLM call, idempotent delete+insert, and the batch-trigger API route all match the plan. Two issues require fixes before this is safe to run.

Fix List
Gemini 3.1 Flash: You are in Ammar's Workflow. Implement each fix below exactly as described. Do not change anything not listed here.

Fix 1 — Missing subject_id in generated_questions insert
- File: trigger/tasks/generate-questions.ts
- Lines: ~277-289
- Issue: The `.insert()` payload on line 278 does NOT include `subject_id`. The `generated_questions` table has a `subject_id` column and it is a foreign key. Without it, the insert will either fail with a constraint violation or leave the column null (depending on DB constraints), making future queries that filter by subject_id return no results.
- Required fix: Add `subject_id: subjectId` to every row object in the `.insert()` call. It should go alongside the other fields.
- Priority: HIGH

Fix 2 — QUESTION_GENERATION_MODEL_LABEL is hardcoded and diverges from actual model
- File: trigger/tasks/generate-questions.ts
- Lines: ~19
- Issue: `QUESTION_GENERATION_MODEL_LABEL` is hardcoded to `"gemini-3.1-flash"` but the actual model used via `GEMINI_MODEL_QUESTIONS` is `"gemini-3.1-flash-lite-preview"`. The label written to `ai_model` column in the DB will be misleading/wrong — it won't match the actual model string.
- Required fix: Replace line 19 with: `const QUESTION_GENERATION_MODEL_LABEL = GEMINI_MODEL_QUESTIONS;` — this ensures the DB value always matches the actual model constant. The import for `GEMINI_MODEL_QUESTIONS` is already present.
- Priority: MEDIUM

Architectural Flags (for Opus only)
None.

Verdict
- Total fixes: 2
- Fix model: Gemini 3.1 Flash
- Escalate to Codex: NO
- Needs Opus re-plan: NO

---
Review saved → /artifacts/review_QuestionGenerationBackend_phase3_2026-05-15.md
Fix model: Gemini 3.1 Flash
