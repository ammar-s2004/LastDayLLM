# Fix A & WTF Signal Computation — Child Topic Scope Gate Resolution

**Date**: 2026-05-01
**Objective**: Fix the A and WTF signal compute pipelines so that question-topic links (which target child/sub-topic IDs) pass through the exam-scope gate (which contains parent topic IDs).

---

## Architecture Context

### Topic Hierarchy
- **119 total topics**: 13 parents (`parent_topic_id IS NULL`), 106 children (`parent_topic_id` points to parent)
- **Exam Scope** stores **parent** topic IDs (e.g., "Control Flow Testing", "Data Flow Testing")
- **Question-Topic Links** store **child** topic IDs (e.g., "Control Flow Graph", "Branch Coverage Criterion")
- **SP signal** already works correctly — it operates at child level, no scope gate
- **ETSM prediction collector** (`lib/etsm/collect.ts:208-211`) already skips parents with children — it only feeds child-level topic IDs to the prediction engine

### The Bug
Both `computeA` and `computeWTF` have a scope gate that checks:
```
if (applyScopeGate && !scopedTopics?.has(link.topic_id)) continue;
```
`scopedTopics` contains **parent** UUIDs. `link.topic_id` is a **child** UUID. They never match → all links are skipped → all scores = 0.

### The Fix
Expand the scope gate's topic set to include **all children** of each scoped parent topic. When the scope says "Control Flow Testing" is in scope, every child of that parent (Control Flow Graph, Statement Coverage, Branch Coverage, etc.) must also pass the gate.

---

## Phase 1: Create Shared Scope Expansion Utility

### What to build
A new exported function in `lib/shared/exam-scope.ts` that expands a `ScopedTopicsByExamType` map to include child topic IDs alongside their parent IDs.

### File: `lib/shared/exam-scope.ts`

**Add this function** (do NOT modify any existing functions or types):

```typescript
/**
 * Expands scoped topic sets to include child topic IDs.
 * The scope gate stores parent topic IDs, but question links reference child IDs.
 * This function adds all child IDs whose parent is in the scope set.
 *
 * @param scopedTopicsByExamType - Map of exam type → Set of parent topic IDs
 * @param childToParentMap - Map of child topic ID → parent topic ID
 * @returns New map with the same structure, but each set also contains child IDs
 */
export function expandScopeWithChildren(
  scopedTopicsByExamType: ScopedTopicsByExamType,
  childToParentMap: Map<string, string>
): ScopedTopicsByExamType {
  const expanded: ScopedTopicsByExamType = new Map();

  for (const [examType, parentIds] of scopedTopicsByExamType.entries()) {
    const expandedSet = new Set<string>(parentIds);

    for (const [childId, parentId] of childToParentMap.entries()) {
      if (parentIds.has(parentId)) {
        expandedSet.add(childId);
      }
    }

    expanded.set(examType, expandedSet);
  }

  return expanded;
}
```

### Constraints
- Do NOT modify `getScopeKeyForExamType`, `isTTType`, `isEndSemType`, `normalizeExamType`, `TopicInfo`, or `ScopedTopicsByExamType`
- The function must be a pure function — no database calls
- The returned map must be a NEW map (do not mutate the input)

### Done when
- Function exists, exported, and compiles without errors

---

## Phase 2: Fix compute-a Pipeline

### Problem
`trigger/tasks/compute-a.ts` fetches topics as `{ id, module_id }` — it never reads `parent_topic_id`. The scope gate in `lib/a/compute.ts` compares child topic IDs against parent-only scope sets. Result: all A scores = 0.

### File: `trigger/tasks/compute-a.ts`

**Step 1**: Update the `TopicRow` type (around line 35-38):
```typescript
type TopicRow = {
  id: string;
  module_id: string | null;
  parent_topic_id: string | null;  // ADD THIS FIELD
};
```

**Step 2**: Update the topics query (around line 122-125) to also fetch `parent_topic_id`:
```typescript
const { data: topics, error: topicsError } = await supabase
  .from("topics")
  .select("id, module_id, parent_topic_id")  // ADD parent_topic_id
  .eq("subject_id", payload.subjectId);
```

**Step 3**: After the topics fetch, build the child→parent map and expand the scope. Add this block AFTER the scope building loop (after line 168, before line 170):
```typescript
// Build child→parent mapping
const childToParentMap = new Map<string, string>();
for (const topic of (topics ?? []) as TopicRow[]) {
  if (topic.parent_topic_id) {
    childToParentMap.set(topic.id, topic.parent_topic_id);
  }
}

// Expand scope to include children of scoped parents
const expandedScopedTopics = expandScopeWithChildren(
  scopedTopicsByExamType,
  childToParentMap
);
```

**Step 4**: Add the import at the top of the file:
```typescript
import { expandScopeWithChildren } from "@/lib/shared/exam-scope";
```

**Step 5**: Pass `expandedScopedTopics` instead of `scopedTopicsByExamType` to `computeA` (around line 191-197):
```typescript
const results = computeA(
  questionsInput,
  linksInput,
  assignmentsInput,
  topicsInput,
  expandedScopedTopics  // WAS: scopedTopicsByExamType
);
```

### File: `lib/a/compute.ts`
**No changes needed.** The compute function itself is correct — it just receives the wrong scope set. Once the trigger task expands the scope, the existing logic will work.

### Constraints
- Do NOT change the `computeA` function signature or logic
- Do NOT change how results are upserted (all 119 topics get rows — this is correct)
- Only modify the trigger task's data preparation

### Done when
- Topics query includes `parent_topic_id`
- `childToParentMap` is built from the topics data
- `expandScopeWithChildren` is called before passing scope to `computeA`
- TypeScript compiles without errors

---

## Phase 3: Fix compute-wtf Pipeline

### Problem
Identical to compute-a: `trigger/tasks/compute-wtf.ts` fetches topics as `{ id, module_id }` and passes the unexpanded scope to `computeWTF`. Same scope gate mismatch, same zero results when test papers are eventually processed.

### File: `trigger/tasks/compute-wtf.ts`

**Step 1**: Update the `TopicRow` type (around line 45-48):
```typescript
type TopicRow = {
  id: string;
  module_id: string | null;
  parent_topic_id: string | null;  // ADD THIS FIELD
};
```

**Step 2**: Update the topics query (around line 132-135) to also fetch `parent_topic_id`:
```typescript
const { data: topics, error: topicsError } = await supabase
  .from("topics")
  .select("id, module_id, parent_topic_id")  // ADD parent_topic_id
  .eq("subject_id", payload.subjectId);
```

**Step 3**: After the scope building loop (after line 178, before line 180), add:
```typescript
// Build child→parent mapping
const childToParentMap = new Map<string, string>();
for (const topic of (topics ?? []) as TopicRow[]) {
  if (topic.parent_topic_id) {
    childToParentMap.set(topic.id, topic.parent_topic_id);
  }
}

// Expand scope to include children of scoped parents
const expandedScopedTopics = expandScopeWithChildren(
  scopedTopicsByExamType,
  childToParentMap
);
```

**Step 4**: Add the import at the top of the file:
```typescript
import { expandScopeWithChildren } from "@/lib/shared/exam-scope";
```

**Step 5**: Pass `expandedScopedTopics` instead of `scopedTopicsByExamType` to `computeWTF` (around line 205-212):
```typescript
const results = computeWTF(
  questionsInput,
  linksInput,
  papersInput,
  topicsInput,
  expandedScopedTopics,  // WAS: scopedTopicsByExamType
  new Date().getFullYear()
);
```

### File: `lib/wtf/compute.ts`
**No changes needed.** Same reasoning as compute-a.

### Constraints
- Identical pattern to Phase 2 — mirror the changes exactly
- Do NOT change `computeWTF` function signature or logic

### Done when
- Same criteria as Phase 2, applied to WTF pipeline
- TypeScript compiles without errors

---

## Phase 4: Verification

### Automated verification
Run this SQL query via Supabase MCP to confirm A scores are non-zero after re-triggering:

```sql
SELECT 
    t.name as topic_name,
    a.a_score,
    a.a_raw,
    a.assignment_count
FROM public.topic_a_scores a
JOIN public.topics t ON a.topic_id = t.id
WHERE a.a_score > 0
ORDER BY a.a_score DESC;
```

**Expected result**: At least 5 topics in Module 3 (Control Flow and Data Flow Testing) should have non-zero A scores, since those are the topics linked to the completed assignment's questions.

### What NOT to test
- WTF scores will still be 0 because there are no completed TEST_PAPER resources — this is correct behavior, not a bug
- SP scores should remain unchanged (52 rows, no scope gate involved)

---

## Files Modified Summary

| File | Change Type | Description |
|------|------------|-------------|
| `lib/shared/exam-scope.ts` | ADD function | `expandScopeWithChildren()` — pure utility |
| `trigger/tasks/compute-a.ts` | MODIFY | Fetch `parent_topic_id`, build child map, expand scope |
| `trigger/tasks/compute-wtf.ts` | MODIFY | Identical pattern to compute-a |

## Files NOT Modified (and why)

| File | Reason |
|------|--------|
| `lib/a/compute.ts` | Logic is correct — only receives wrong scope set |
| `lib/wtf/compute.ts` | Same — logic correct, scope input wrong |
| `lib/etsm/collect.ts` | Already handles child-level signals correctly (lines 208-211) |
| `trigger/tasks/compute-sp.ts` | No scope gate — SP uses AI scoring, not question links |
| `trigger/tasks/compute-te.ts` | No scope gate — TE uses teacher hints, not question links |
| `trigger/tasks/process-questions.ts` | Correctly links questions to child topics — this is intended |
