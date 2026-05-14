# Review — Phase 1: NC Signal + Notes Extraction Overhaul
Date: 2026-04-12
Status: NEEDS FIXES

## Summary

Codex implemented all 7 Phase 1 steps. The core structural work is
correct — `NotesIntelResult` interface matches the plan exactly, NC
formula logic is sound, three-loop Qdrant chunk mapping is correct,
and the upload route correctly extracts `pageCount` via `pdf-lib`.
Two issues need fixing: the NC tables migration was never applied to
the database, and the `contents` format in `extractNotesIntel` is
wrong for the Google GenAI SDK's multimodal call (the promptText
string is passed as a raw element alongside a fileData part, which
will not construct the `parts` array correctly).

---

## Fix List

> **Gemini 3.1 Pro:** You are in Ammar's Workflow. Implement each fix
> below exactly as described. Use low effort mode. Do not change
> anything not listed here.

---

### Fix 1 — NC migration not applied to production DB

- **File:** Not a code fix — DB state issue
- **Issue:** `nc_scores` and `nc_topic_map` tables do not exist in the
  live database. The migration file
  `supabase/migrations/20260401000001_add_nc_tables.sql` was written
  but never pushed. The `process-notes-qdrant` task will throw at
  runtime when it tries to upsert into `nc_scores`.
- **Required fix:** Apply the migration via MCP (Supabase admin client)
  using the exact SQL from `20260401000001_add_nc_tables.sql`. Do not
  modify the SQL file. Just push it.
- **Priority:** HIGH — **this is a blocker**. The task will crash immediately
  on first notes upload without this.

---

### Fix 2 — `contents` array format incorrect for multimodal call

- **File:** `lib/extraction/ai.ts`
- **Lines:** 148–151
- **Issue:** The `contents` array currently passes:
  ```ts
  contents: [
    { fileData: { fileUri, mimeType } },
    promptText    // ← raw string, not a valid Part object
  ],
  ```
  The Google GenAI SDK (`@google/genai`) expects each element in
  `contents` to be a `Part` object, not a raw string. A raw string
  will be silently ignored or cause a type error at runtime. The
  correct format for a mixed file + text call matches the pattern
  used by the old `condenseFileDirectly` (which this replaces) and by
  `lib/sp/compute.ts` (SP uses `contents: prompt` — just a string —
  because it's text-only).
  
  For multimodal (file + text), the correct pattern is:
  ```ts
  contents: {
    parts: [
      { fileData: { fileUri, mimeType } },
      { text: promptText }
    ]
  }
  ```
- **Required fix:** Change the `contents` field in the
  `ai.models.generateContent()` call in `extractNotesIntel` to use
  the `parts` array format:
  ```ts
  contents: {
    parts: [
      { fileData: { fileUri, mimeType } },
      { text: promptText }
    ]
  }
  ```
- **Priority:** HIGH — the AI call will fail or return empty at runtime
  without this fix.

---

### Fix 3 — `has_code` missing from depth score formula

- **File:** `lib/nc/compute.ts`
- **Lines:** 35–40
- **Issue:** The plan specifies this exact depth score formula:
  ```
  depth_score = 0.30 × explanation_depth
              + 0.25 × (has_derivation ? 1 : 0)
              + 0.20 × (has_worked_example ? 1 : 0)
              + 0.15 × (has_diagram ? 1 : 0)
              + 0.10 × (has_definition ? 1 : 0)
  ```
  `has_code` is NOT in the depth score formula. The formula weights
  sum to 1.0 without it. Codex's implementation is correct.
  
  However, `has_code` IS captured in `depth_breakdown` (stored in DB
  for future use) — this is fine per the `NCFileResult` interface.
  No fix needed here.
- **Priority:** N/A (not a bug — documenting for clarity)

---

## Architectural Flags

None. The three-tier chunk structure, NC formula design, and Supabase
upsert pattern all match the Opus plan correctly.

---

## Verdict

- **Total fixes:** 2 (Fix 3 is not a bug)
- **Fix model:** Gemini 3.1 Pro (low effort) for Fix 2; direct MCP
  for Fix 1 (DB push, no code change)
- **Escalate to Codex:** NO
- **Needs Opus re-plan:** NO
