Review — Phase 1: ETSM TE Signal
Date: 2026-04-12
Status: NEEDS FIXES

Summary
Codex did a strong job overall. The core compute logic, prompt builder, LLM integration, Zod validation, NC OR-aggregation, and WTF enrichment are all correct and match the plan. The migration is clean and was applied successfully. One integration issue was found: `compute-wtf` was dropped from `trigger/index.ts`, which would break the WTF pipeline in production.

Fix List
Gemini 3.1 Flash: You are in Ammar's Workflow. Implement each fix below exactly as described. Do not change anything not listed here.

Fix 1 — Missing `compute-wtf` import in trigger/index.ts
- File: trigger/index.ts
- Lines: ~7-8
- Issue: Codex added `compute-te` but the `compute-wtf` import that was previously present is now missing. This means the WTF task would not be registered with Trigger.dev and would silently fail when triggered from `process-questions` and `process-pyq`.
- Required fix: Add `import "./tasks/compute-wtf";` to `trigger/index.ts`, between the `compute-sp` and `compute-te` lines.
- Priority: HIGH

Architectural Flags (for Opus only)
None. The architecture is sound.

Verdict
- Total fixes: 1
- Fix model: Gemini 3.1 Flash
- Escalate to Codex: NO
- Needs Opus re-plan: NO

---

Review saved → /artifacts/review_ETSM_TE_Signal_phase1_2026-04-12.md
Fix model: Gemini 3.1 Flash
