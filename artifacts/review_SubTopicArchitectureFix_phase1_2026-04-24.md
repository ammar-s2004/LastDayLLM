Review — Phase 1: Sub-Topic Architecture Fix
Date: 2026-04-24
Status: NEEDS FIXES

Summary
Codex failed to implement any of the requested changes. The target files (`app/dev-test/page.tsx` and `app/api/exam-scopes/route.ts`) remain completely unmodified. The entire plan needs to be executed from scratch.

Fix List
Gemini 3.1 Flash: You are in Ammar's Workflow. Implement each fix below exactly as described. Do not change anything not listed here.

Fix 1 — Frontend Filter & Display Updates
- File: app/dev-test/page.tsx
- Lines: ~392, ~21-32, and JSX render
- Issue: Codex failed to make any changes to the UI or queries.
- Required fix: 
  1. Add `parent_topic_id` to the topics fetch query (around line 392).
  2. Update the `Subject` interface to include `parent_topic_id?: string | null` in the topics array.
  3. Update `PredictionScore` interface to add `parent?: { name?: string | null } | null`.
  4. In the JSX where module topics are mapped for checkboxes, filter out child rows using `.filter((topic) => topic.parent_topic_id == null)`.
  5. When calling `toggleScopeModule` in JSX, filter the array passed to it to only include parent topics.
  6. In predictions rendering, show the format `{score.topics?.parent?.name} › {score.topics?.name}`.
- Priority: HIGH

Fix 2 — API Parent Topic Guard
- File: app/api/exam-scopes/route.ts
- Lines: ~102
- Issue: Codex failed to implement the server-side guard.
- Required fix: Immediately after the existing topic ownership check, add a query to verify that all provided `topicIds` have `parent_topic_id` IS NULL. If not, return a 400 error indicating that the scope must reference heading-level topics only.
- Priority: HIGH

Verdict
- Total fixes: 2
- Fix model: Gemini 3.1 Flash
- Escalate to Codex: NO
- Needs Opus re-plan: NO
