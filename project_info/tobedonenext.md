## Feature: Single-Pass AI Pipeline Rebuild
What it does: Completely rewrites the Notes extraction background pipeline to use Gemini 2.0 native multimodal file abilities, executing condensation in a single LLM pass and saving compute costs/latency.

Phases:
- Phase 1 — [YOURS] Gut Legacy Code (Completed)
- Phase 2 — [PERPLEXITY] `condenseFileDirectly` & `condensePDFWithSegmentation` in `lib/extraction/ai.ts` (Completed)
- Phase 2b — [YOURS] Update `buildNotesCondensationPrompt` output schema (Pending - per user)
- Phase 3 — [PERPLEXITY] Rewrite `run()` in `process-notes-qdrant.ts` (In Progress)
- Phase 4 — [YOURS] Integrate, type-check, build

Files created/modified/deleted:
- `lib/chunking/` (Deleted to DUSTBIN)
- `app/api/notes-v2/upload/route.ts` (Modified)
- `lib/extraction/ai.ts` (Modified)
- `lib/ai-prompts.ts` (Modified)
- `trigger/tasks/process-notes-qdrant.ts` (Modified)

Acceptance criteria:
- The pipeline processes PDFs natively using Gemini without intermediate raw extraction.
- Temporary legacy bridging stubs are cleared from `ai.ts` during Phase 4 crossover.
- End-to-end processing succeeds with 0 TypeScript errors.
