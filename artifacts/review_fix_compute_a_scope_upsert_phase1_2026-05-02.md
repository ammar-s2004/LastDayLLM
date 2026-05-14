Review — Phase 1: Scoping compute-a Upserts
Date: 2026-05-02
Status: CLEAR

Summary
Codex correctly implemented the filtering logic across both the library and the task runner. The `topic_a_scores` table will now only receive rows for topics within the active union of exam scopes, successfully matching the behavior of the SP signal pipeline. The "no scope fallback" is correctly handled, ensuring no regressions when exam scopes are not configured.

Fix List
Gemini 3.1 Flash: You are in Ammar's Workflow. Implement each fix below exactly as described. Do not change anything not listed here.
(None - No fixes required for this phase)

Architectural Flags (for Opus only)
Critical Structural Flaw: The exact same bug addressed here (unfiltered upserts polluting signal tables) exists in both `compute-wtf.ts` and `compute-te.ts`.
- `trigger/tasks/compute-wtf.ts`: Fetches all topics and upserts rows for every topic in the subject, regardless of scope.
- `trigger/tasks/compute-te.ts`: Similar behavior; ignores scope during the result mapping/upsert phase.
These should likely be added as a Phase 2 and Phase 3 to the plan to ensure consistency across the entire ETSM signal layer.

Verdict
- Total fixes: 0
- Fix model: Gemini 3.1 Flash
- Escalate to Codex: NO
- Needs Opus re-plan: NO
