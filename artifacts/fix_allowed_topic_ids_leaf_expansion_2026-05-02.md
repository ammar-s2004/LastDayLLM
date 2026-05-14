# Technical Plan: Fix allowedTopicIds Derivation (Leaf-Only Expansion)

## Root Cause

`exam_scope_topics` stores 7 PARENT topic IDs — this is correct by design (the API enforces parent-only selection).

`resolveChildTopicIds()` (used by SP) expands parent IDs to ONLY their children (leaf topics). 7 parents → 52 children. SP is correct.

`expandScopeWithChildren()` (used by A, WTF, TE) seeds its output set with the parent IDs AND then adds children: `new Set<string>(parentIds)` then iterates `childToParentMap`. Result: 7 parents + 52 children = 59. When this is used to build `allowedTopicIds`, parent topics get rows written to signal tables. Parents are organizational containers — they must not receive signal rows.

**No upstream bug. No scope save bug. The fix is in how `allowedTopicIds` is derived in compute-a.ts, compute-wtf.ts, and compute-te.ts.**

## Fix Strategy

Replace the current `allowedTopicIds` derivation in all three task files with a leaf-only expansion. The tasks already have the full topic list with `parent_topic_id` data — no extra DB call needed. The logic must match `resolveChildTopicIds` semantics:

Given a set of parent IDs from `exam_scope_topics`:
- For each parent, find all topics whose `parent_topic_id === parentId` → these are the children
- If a parent has 1+ children → include ONLY the children, NOT the parent
- If a parent has 0 children (leaf parent) → include the parent itself as the scorable unit

`expandScopeWithChildren()` is NOT changed — it is still used for the scope gate (checking whether a question-topic link's topic_id passes). The gate needs both parent and child IDs. Only `allowedTopicIds` (the upsert filter) must change.

---

## Phase 1 — Fix allowedTopicIds in compute-a.ts

**File:** `trigger/tasks/compute-a.ts`

**Current code (lines ~184-187):**
```
const allowedTopicIds =
  expandedScopedTopics.size > 0
    ? new Set(Array.from(expandedScopedTopics.values()).flatMap((topicIds) => Array.from(topicIds)))
    : undefined;
```

**What this currently produces:** 7 parent IDs + 52 child IDs = 59 IDs. Wrong.

**Required replacement:**

After `expandedScopedTopics` is built and before `assignmentsInput` is assembled, derive `allowedTopicIds` using leaf-only expansion:

1. Collect the raw parent scope IDs. These are the IDs that were originally in `exam_scope_topics` (before child expansion). They live in `scopedTopicsByExamType` — get the union of all Sets in that map.

2. Build a `parentToChildrenMap: Map<string, string[]>` from the existing `(topics ?? []) as TopicRow[]` array: for each topic that has a `parent_topic_id`, push `topic.id` into the map keyed by `parent_topic_id`.

3. For each raw parent ID:
   - Look up its children in `parentToChildrenMap`
   - If children exist: add all child IDs to the result set
   - If no children: add the parent ID itself (leaf fallback)

4. If the resulting set is non-empty, assign it as `allowedTopicIds`. If `scopedTopicsByExamType` is empty (no scope configured), assign `undefined`.

**Done criteria:**
- `allowedTopicIds` contains exactly 52 IDs (matching SP)
- `topic_a_scores` no longer contains rows for parent topics
- `expandedScopedTopics` is NOT changed — scope gate still works

---

## Phase 2 — Fix allowedTopicIds in compute-wtf.ts

**File:** `trigger/tasks/compute-wtf.ts`

Same derivation change as Phase 1. The task already has `(topics ?? []) as TopicRow[]` available with `parent_topic_id` data.

**Current code (lines ~195-198):**
```
const allowedTopicIds =
  expandedScopedTopics.size > 0
    ? new Set(Array.from(expandedScopedTopics.values()).flatMap((topicIds) => Array.from(topicIds)))
    : undefined;
```

Replace with the identical leaf-only expansion logic described in Phase 1 using the task's existing `topics` fetch (which selects `id, module_id, parent_topic_id`).

**Done criteria:** `topic_wtf_scores` contains only child/leaf topic rows when scope is active.

---

## Phase 3 — Fix allowedTopicIds in compute-te.ts

**File:** `trigger/tasks/compute-te.ts`

Same derivation change. The task has `allTopics` (type `TopicParentRow[]`, fields `id, parent_topic_id`) already fetched for the child-parent map.

**Current code (lines ~215-218):**
```
const allowedTopicIds =
  expandedScopedTopics.size > 0
    ? new Set(Array.from(expandedScopedTopics.values()).flatMap((topicIds) => Array.from(topicIds)))
    : undefined;
```

Replace using `allTopics` for the parent-to-children map (same leaf-only expansion logic).

**Done criteria:** `topic_te_scores` and Gemini prompt both contain only child/leaf topic rows when scope is active.

---

## Shared Extraction (Optional, Recommended)

If Codex finds it cleaner, the leaf-only expansion can be extracted into a shared utility function. Suggested location: `lib/shared/exam-scope.ts`. Suggested name: `deriveAllowedLeafTopicIds`. Signature:

- Input: `rawScopeParentIds: Set<string>`, `allTopics: Array<{ id: string; parent_topic_id: string | null }>`
- Output: `Set<string> | undefined` — undefined when rawScopeParentIds is empty

This avoids duplicating the logic across three task files. If Codex extracts it, all three tasks import and call it.

---

## Constraints

- Do NOT change `expandScopeWithChildren` in `lib/shared/exam-scope.ts`
- Do NOT change the scope gate logic (`applyScopeGate`) in `computeA` or `computeWTF`
- Do NOT change `lib/a/compute.ts`, `lib/wtf/compute.ts`, `lib/te/compute.ts`
- Do NOT change the exam-scopes API route
- `allowedTopicIds` remains optional — when scope is empty, pass `undefined` (all topics behavior unchanged)
- SP (`trigger/tasks/compute-sp.ts`) is correct and must NOT be touched
