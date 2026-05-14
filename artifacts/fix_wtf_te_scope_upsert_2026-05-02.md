# Technical Plan: Scope-Filter WTF and TE Signal Upserts

## Status at time of writing
Flash made partial/failed edits. Current file state:
- `lib/wtf/compute.ts` — UNCHANGED from original (no effectiveTopics, still iterates `topics`)
- `trigger/tasks/compute-wtf.ts` — `allowedTopicIds` derivation added (lines ~184-187) and passed to `computeWTF` call (line ~230), but `computeWTF` signature does not yet accept it → TypeScript error
- `lib/te/compute.ts` — `effectiveTopics` filter added to `computeTE`, signature updated with optional `allowedTopicIds` param — DONE
- `trigger/tasks/compute-te.ts` — import for `expandScopeWithChildren`/`ScopedTopicsByExamType` added, but scope fetch (DB queries for exam_scopes + exam_scope_topics) is NOT present; `allowedTopicIds` is never derived and never passed to either `computeTE` call — INCOMPLETE

---

## Phase 2 — Fix WTF signal scoping

### File: lib/wtf/compute.ts

The function signature must be updated to accept an optional `allowedTopicIds?: Set<string>` as the 8th parameter (after `currentYear`).

Immediately after the signature, before `topicResults` is declared, derive `effectiveTopics`:
- If `allowedTopicIds` is provided and its size > 0, filter `topics` to only include entries whose `topic_id` is in the set
- Otherwise assign `effectiveTopics = topics`

The `topicResults` init loop (currently `for (const topic of topics)`) must be changed to iterate `effectiveTopics`.

The result-building loop (currently `for (const topic of topics)` starting at line 153) must also be changed to iterate `effectiveTopics`.

Nothing else in this file changes.

### File: trigger/tasks/compute-wtf.ts

The `allowedTopicIds` derivation block that Flash added (~lines 195-199) is correct and must be kept as-is. It derives `allowedTopicIds` as `undefined` when no scope exists, or as a flat `Set<string>` union of all topic IDs from `expandedScopedTopics`.

The `computeWTF` call must pass `allowedTopicIds` as the 8th argument (after `new Date().getFullYear()`). Flash already did this. Verify it is present; if not, add it.

Nothing else in this file changes.

### Done criteria for Phase 2
- `lib/wtf/compute.ts` compiles with no TypeScript errors
- `computeWTF` accepts and applies `allowedTopicIds`
- `trigger/tasks/compute-wtf.ts` compiles with no TypeScript errors
- `topic_wtf_scores` will only receive rows for scoped topics when a scope is defined

---

## Phase 3 — Fix TE signal scoping

### Context
`compute-te.ts` is structurally different from A and WTF. It does NOT currently fetch exam scope data at all. It must be extended to fetch scope, derive `allowedTopicIds`, and pass it to both `computeTE` calls (the zero-hint early-return path and the main LLM path).

`lib/te/compute.ts` — already done by Flash. `computeTE` now accepts optional `allowedTopicIds?: Set<string>` as the 4th parameter and filters via `effectiveTopics`. Do not touch this file.

### File: trigger/tasks/compute-te.ts

#### Step A — Add local type definitions (after existing type blocks, before the task definition)

Add these two types:
- `ExamScopeRow`: fields `id: string` and `exam_type: string`
- `ExamScopeTopicRow`: fields `exam_scope_id: string` and `topic_id: string`
- `TopicScopeRow`: fields `id: string` and `parent_topic_id: string | null`

Also add a local type for a minimal topic row used just for child-parent mapping:
- `TopicParentRow`: fields `id: string`, `parent_topic_id: string | null`

#### Step B — Add scope DB fetches inside the run function

Insert after the `topics` fetch (currently line ~119-125) and before `const topicRows = ...`.

1. Fetch `user_id` from subject. The task payload only has `subjectId`. Add a query: `supabase.from("subjects").select("user_id").eq("id", payload.subjectId).single()`. Store as `subjectRow`. Throw on error.

2. Fetch `topics` for parent resolution: `supabase.from("topics").select("id, parent_topic_id").eq("subject_id", payload.subjectId)`. Store as `allTopicRows` (type `TopicParentRow[]`). Throw on error. This is separate from the existing `topics` query which selects `id, name, module_id, sub_topics` for enrichment.

3. Fetch exam scopes: `supabase.from("exam_scopes").select("id, exam_type").eq("subject_id", payload.subjectId).eq("user_id", subjectRow.user_id)`. Store as `scopeRows` (type `ExamScopeRow[]`). Throw on error.

4. Conditionally fetch scope topics: if `scopeRows` is non-empty, fetch `supabase.from("exam_scope_topics").select("exam_scope_id, topic_id").in("exam_scope_id", scopeIds)`. Store as `scopeTopicRows` (type `ExamScopeTopicRow[]`). Default to `[]` if scopeRows is empty.

#### Step C — Derive allowedTopicIds (insert after the scope topic fetch)

Build `scopedTopicsByExamType: Map<string, Set<string>>` from scopeRows and scopeTopicRows, same pattern as compute-a.ts and compute-wtf.ts.

Build `childToParentMap: Map<string, string>` from `allTopicRows` where `parent_topic_id` is non-null.

Call `expandScopeWithChildren(scopedTopicsByExamType, childToParentMap)` → `expandedScopedTopics`.

Derive `allowedTopicIds`:
- If `expandedScopedTopics.size > 0`: flatten all Sets into a single `Set<string>`
- Else: `undefined`

#### Step D — Filter topicRows to scoped topics before the AI prompt (NEW)

After `allowedTopicIds` is derived (Step C), and before `topicInfos` is built, add a filter:

- Define `effectiveTopicRows` as follows: if `allowedTopicIds` is defined and non-empty, filter `topicRows` to only include entries whose `id` is in `allowedTopicIds`. Otherwise assign `effectiveTopicRows = topicRows`.
- Replace the existing `topicInfos` declaration (currently `topicRows.map(...)`) to use `effectiveTopicRows.map(...)` instead.
- Replace the existing `topicIds` declaration (currently `topicRows.map(topic => topic.id)`) to use `effectiveTopicRows.map(...)` instead. This controls which topics' NC and WTF scores are looked up.
- Replace the `enrichedTopics` declaration (currently `topicRows.map(...)`) to use `effectiveTopicRows.map(...)` instead. This ensures only scoped topics are sent to Gemini.
- `validTopicIds` (used to filter the Gemini response) is derived from `topicRows.map(topic => topic.id)` — change this to use `effectiveTopicRows` as well. This ensures AI scores for any hallucinated or out-of-scope topic IDs are discarded.

Backward compatibility: when `allowedTopicIds` is `undefined` (no scope configured), `effectiveTopicRows === topicRows` — behavior is identical to before.

#### Step E — Pass allowedTopicIds to both computeTE calls

With the `topicInfos` already filtered in Step D, passing `allowedTopicIds` to `computeTE` is still required to ensure the library function's internal `effectiveTopics` filter is also consistent.

1. **Zero-hint early-return path** (line ~138): `computeTE([], confidence, topicInfos)` → change to `computeTE([], confidence, topicInfos, allowedTopicIds)`

2. **Main LLM path** (line ~288): `computeTE(emphasisInputs, confidence, topicInfos)` → change to `computeTE(emphasisInputs, confidence, topicInfos, allowedTopicIds)`

#### Step F — Ensure imports are present

The import line for `expandScopeWithChildren` and `ScopedTopicsByExamType` from `@/lib/shared/exam-scope` was added by Flash. Verify it is present. If not, add it.

### Done criteria for Phase 3
- `trigger/tasks/compute-te.ts` compiles with no TypeScript errors
- `lib/te/compute.ts` is not modified
- `topic_te_scores` will only receive rows for scoped topics when a scope is defined
- The zero-hint early-return path is also scoped correctly (does not write zero rows for out-of-scope topics)
- Gemini only receives scoped topics in the prompt — ranking is within the exam-relevant pool only, matching SP signal behavior

---

## Constraints (both phases)
- Do not touch `lib/shared/exam-scope.ts`
- Do not touch `lib/etsm/collect.ts`
- Do not touch `trigger/tasks/compute-sp.ts`
- Do not touch `trigger/tasks/compute-a.ts`
- Do not touch `lib/a/compute.ts`
- `allowedTopicIds` is optional in all library function signatures — backward compatible
- When no scope is configured, behavior is unchanged (all topics get a row)
