# Review — Phase 0: SP Signal (Syllabus Prior)
Date: 2026-04-12
Status: NEEDS FIXES

## Summary

Codex implemented all four Phase 0 steps. The overall structure is correct — migration is clean, the single LLM call pattern is right, trigger task logic is solid, and exam-scopes API wiring is non-blocking. Two issues need fixing: a fragile `sub_topics` parsing assumption that will silently lose subtopic data for many topics, and a missing centrality_score range clamp before DB insert.

---

## Fix List

> **Gemini 3.1 Pro:** You are in Ammar's Workflow. Implement each fix below exactly as described. Use low effort mode. Do not change anything not listed here.

---

### Fix 1 — sub_topics jsonb shape is an array of objects, not strings

- **File:** `trigger/tasks/compute-sp.ts`
- **Lines:** 26-32
- **Issue:** `parseSubtopics()` filters `value` items by `typeof item === "string"`. But `topics.sub_topics` in the DB is stored as a JSONB array of objects, not strings. Per migration `20260220000003_update_rpc_with_sub_topics.sql` line 14: topics input is `{ name: string, topic_no: number, is_core?: boolean, sub_topics?: string[] }` — the sub_topics column stores **string arrays**. However, looking at `process-syllabus.ts`, the actual value stored depends on the AI output. The real risk: if the JSONB is stored as `["BVA", "Decision Tables"]` (strings), `parseSubtopics` works. But if it's ever `[{"name":"BVA"}]` (objects), all subtopics silently return `[]`. The filter is too narrow and should handle both shapes.
- **Required fix:** In `parseSubtopics`, add a fallback to extract `.name` from objects:
  ```typescript
  function parseSubtopics(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (typeof item === "string") return [item];
      if (typeof item === "object" && item !== null && typeof (item as any).name === "string") {
        return [(item as any).name];
      }
      return [];
    });
  }
  ```
- **Priority:** HIGH

---

### Fix 2 — centrality_score unclamped before DB insert

- **File:** `trigger/tasks/compute-sp.ts`
- **Lines:** 112-129
- **Issue:** The DB has a `CHECK (centrality_score >= 0.0 AND centrality_score <= 1.0)` constraint. If Gemini returns a score outside this range (e.g. 1.05 or -0.1), the entire batch upsert throws and the task fails/retries. No clamping happens before insert.
- **Required fix:** In the `rows` map, clamp the score:
  ```typescript
  centrality_score: Math.min(1.0, Math.max(0.0, result.centralityScore)),
  ```
- **Priority:** MEDIUM

---

### Fix 3 — `topicById` map unused for non-matched results throws instead of skips

- **File:** `trigger/tasks/compute-sp.ts`
- **Lines:** 113-120
- **Issue:** When `topicById.get(result.topicId)` returns `undefined` (topic not in the confirmed list but Gemini returned it anyway — shouldn't happen but is possible), the fallback `[...moduleMap.values()].find(...)` is attempted. If that also fails, it throws `new Error(...)` which will cause the entire task to fail and retry. A single unmatched topic kills the whole batch.
- **Required fix:** Change the throw to a `logger.warn` + `continue` skip (same pattern used in `compute.ts` line 97-103 for the unmatched case):
  ```typescript
  if (!resolvedModuleId) {
    logger.warn("[compute-sp] Could not resolve module_id, skipping topic", {
      topicId: result.topicId,
    });
    return null;
  }
  ```
  Then filter out nulls: `.filter(Boolean)` on the rows array before upsert.
- **Priority:** MEDIUM

---

## Architectural Flags

None. The single-LLM-call design, scope JSON structure, and upsert-with-conflict pattern are all correct per the Opus plan.

---

## Verdict

- **Total fixes:** 3
- **Fix model:** Gemini 3.1 Pro (low effort)
- **Escalate to Codex:** NO
- **Needs Opus re-plan:** NO
