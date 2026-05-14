# ETSM A (Assignment) Signal — Implementation Plan

## Overview

A is a lightweight, frequency-based signal. If a professor assigns homework on a topic, that topic matters to them. No marks weighting (assignments don't carry marks in the DB), no year decay — just pure topic frequency across assignments, normalized per module, gated by exam scope.

Philosophy: **assigned it → cares about it → boost it.**

---

## What Already Exists

| Component | Status | Details |
|---|---|---|
| Assignment extraction | ✅ Live | `process-questions.ts` handles `ASSIGNMENT` resource_type |
| Questions stored | ✅ Live | `questions` table, `marks = NULL` for assignments |
| Topic links stored | ✅ Live | `question_topics` table with relevance scores |
| Exam scope gate | ✅ Live | `exam_scopes` + `exam_scope_topics` tables, reusable from WTF |
| `detected_exam_type` on resources | ✅ Live | User tags exam type at upload (Layer 1), AI detects (Layer 2). Assignments already have this — confirmed `TT1` exists in production data. |

### What Does NOT Exist

- `topic_a_scores` table
- `assignments_in_exam` flag (college_factor)
- A-signal compute logic
- Trigger wiring

---

## Architecture

### The college_factor Question

Your sketch says: "do assignments appear in your exams?" — asked once on first assignment upload, stored permanently.

**Where to store it**: The `subjects` table is the only candidate. There's no `subject_config` table. Two options:

1. **Add a JSONB `config` column to `subjects`** — flexible, future-proof for other per-subject flags
2. **Add a boolean `assignments_in_exam` column to `subjects`** — simple, explicit

> [!IMPORTANT]
> **Recommendation: Option 1 — JSONB `config` column.** This is inevitable. You'll want more per-subject toggles later (e.g., "does your college have practicals?", "oral exam?"). Adding a JSONB now saves future migrations. The `assignments_in_exam` flag becomes `config->>'assignments_in_exam'`.

The college_factor mapping:

| `assignments_in_exam` | `college_factor` | Meaning |
|---|---|---|
| `true` | **1.0** | Assignments directly reflect exam content |
| `false` | **0.3** | Assignments are tangential, low signal weight |
| `null` (not yet answered) | **0.5** | Default — moderate assumption |

This scales the A-signal's base weight in the final scoring engine:
```
W[A] = 0.12 × college_factor
```

The actual weight calculation is a scoring engine concern, not computed here. The A-signal just stores the raw and normalized scores. The `college_factor` value is read at scoring time.

---

## Data Model

### ALTER `subjects` — Add Config

```
ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}';
```

The `assignments_in_exam` flag lives at `config->>'assignments_in_exam'` (`true` / `false` / absent).

### New Table: `topic_a_scores`

```
id              UUID PK
subject_id      UUID FK → subjects(id) ON DELETE CASCADE
module_id       UUID FK → modules(id) ON DELETE SET NULL
topic_id        UUID FK → topics(id) ON DELETE CASCADE
a_score         DOUBLE PRECISION NOT NULL   -- normalized 0-1 within module
a_raw           DOUBLE PRECISION NOT NULL   -- pre-normalization (raw count)
assignment_count INTEGER NOT NULL           -- distinct assignment appearances
computed_at     TIMESTAMPTZ NOT NULL DEFAULT now()

UNIQUE (topic_id)   -- one score per topic, recomputed on each upload
```

RLS: same pattern as all other score tables.

---

## Compute Logic

### Step 1 — Gather Assignment Resources

```
SELECT id, detected_exam_type
FROM resources
WHERE subject_id = ?
  AND resource_type = 'ASSIGNMENT'
  AND status IN ('COMPLETED', 'PARTIAL')
```

### Step 2 — Gather Questions + Topic Links

```
SELECT q.id, q.resource_id, qt.topic_id, qt.relevance
FROM questions q
JOIN question_topics qt ON qt.question_id = q.id
WHERE q.subject_id = ?
  AND q.resource_id IN (assignment_resource_ids)
  AND qt.relevance >= 0.4     -- relevance floor
```

### Step 3 — Module Scope Gate (Reuse WTF Logic)

For each assignment resource:
- Get its `detected_exam_type`
- If TT1 → only count topic links where topic is in TT1's exam scope
- If TT2 → only count topic links where topic is in TT2's exam scope
- If END_SEMESTER or UNKNOWN or NULL → count all topics (no gate)

This is the EXACT same logic as WTF's `getScopeKeyForExamType()` + `applyScopeGate`. We can import and reuse the shared scope utilities.

### Step 4 — Count Distinct Assignments Per Topic

```
for each topic T in module M:
  assignment_count(T) = count of DISTINCT resource_ids
    where topic T appears with relevance >= 0.4
    AND the resource's exam scope includes module M
```

This counts "how many different assignments mentioned this topic" — not how many questions. A topic appearing 5 times in one assignment counts as 1. This prevents a single verbose assignment from dominating.

### Step 5 — Per-Module Normalization

```
for each module M:
  max_count_M = max(assignment_count) among topics in M
  a_score(T) = assignment_count(T) / max_count_M   if max_count_M > 0
             = 0                                      if max_count_M == 0
```

### Step 6 — Upsert to `topic_a_scores`

Batch upsert with `ON CONFLICT (topic_id) DO UPDATE`.

---

## Shared Scope Utilities

The scope gate logic currently lives inline in `lib/wtf/compute.ts`. Both WTF and A need the same functions:

- `normalizeExamType(examType) → string | null`
- `getScopeKeyForExamType(examType) → string | null`
- `isTTType(examType) → boolean`

> [!IMPORTANT]
> **Extract these 3 functions into a shared module: `lib/shared/exam-scope.ts`.**
> Both `lib/wtf/compute.ts` and `lib/a/compute.ts` import from there.
> This prevents duplication and ensures scope logic stays consistent.
> 
> WTF's `compute.ts` should be updated to import from the shared module instead of defining them locally. This is a safe refactor — the functions are pure, stateless, and have no side effects.

---

## Edge Cases

| Scenario | Handling |
|---|---|
| No assignments uploaded | Return empty — all A = 0 |
| Assignment has no `detected_exam_type` | Treat as END_SEM (no scope gate, all topics eligible) |
| No exam scopes configured | No scope gate — all topics eligible (same as WTF) |
| Topic appears in same assignment multiple times | Count as 1 (distinct resource_id per topic) |
| `relevance < 0.4` | Filtered out — weak links don't count |
| Student hasn't answered `assignments_in_exam` | `college_factor` defaults to 0.5 at scoring time |

---

## Files to Create/Modify

### Phase 1 — Migration + Shared Scope + Core + Task + Pipeline Wiring

| # | File | Action | Purpose |
|---|---|---|---|
| 1 | `supabase/migrations/20260412200000_add_a_signal.sql` | CREATE | Add `config` JSONB to `subjects`, create `topic_a_scores` |
| 2 | `lib/shared/exam-scope.ts` | CREATE | Extract `normalizeExamType`, `getScopeKeyForExamType`, `isTTType` |
| 3 | `lib/wtf/compute.ts` | MODIFY | Import scope functions from shared instead of defining locally |
| 4 | `lib/a/compute.ts` | CREATE | Pure computation: count topics, scope gate, per-module normalization |
| 5 | `lib/a/index.ts` | CREATE | Barrel export |
| 6 | `trigger/tasks/compute-a.ts` | CREATE | Trigger.dev task: fetch → compute → upsert |
| 7 | `trigger/index.ts` | MODIFY | Register `compute-a` |
| 8 | `trigger/tasks/process-questions.ts` | MODIFY | After commit, trigger `compute-a` (only when `resourceType === 'ASSIGNMENT'`) |

### Phase 2 — UI: `assignments_in_exam` One-Time Prompt

| # | File | Action | Purpose |
|---|---|---|---|
| 9 | `app/api/subjects/route.ts` | MODIFY | Add PATCH handler to update `subjects.config` |
| 10 | `app/dev-test/page.tsx` | MODIFY | Add one-time prompt in assignment upload modal |

### What NOT to Touch

- `lib/te/` — teacher emphasis signal
- `lib/nc/` — notes coverage signal
- `lib/sp/` — syllabus prior signal
- `lib/hints.ts` — hints parser
- `trigger/tasks/process-pyq.ts` — PYQ pipeline (PYQs are NOT assignments)
- `trigger/tasks/process-notes-qdrant.ts` — notes pipeline

---

## Detailed File Specs

### Migration: `20260412200000_add_a_signal.sql`

1. ALTER `subjects` — add `config JSONB NOT NULL DEFAULT '{}'`
2. CREATE TABLE `topic_a_scores` — follows `topic_wtf_scores` pattern
3. CREATE INDEX on `topic_a_scores(subject_id)`
4. ENABLE RLS + policies (service_role all, authenticated read own)

### `lib/shared/exam-scope.ts`

Extract from `lib/wtf/compute.ts`:

```
export function normalizeExamType(examType: string | null): string | null
export function getScopeKeyForExamType(examType: string | null): string | null
export function isTTType(examType: string | null): boolean
export function isEndSemType(examType: string | null): boolean
```

These are pure functions. No DB access. No side effects.

### `lib/wtf/compute.ts` — MODIFY

Remove the local definitions of `normalizeExamType`, `getScopeKeyForExamType`, `isTTType`, `isEndSemType`. Replace with:

```
import { normalizeExamType, getScopeKeyForExamType, isTTType, isEndSemType } from "@/lib/shared/exam-scope";
```

Everything else in `compute.ts` stays exactly the same.

### `lib/a/compute.ts`

Exports one pure function:

```
computeA(
  assignmentQuestions: AssignmentQuestion[],
  questionTopicLinks: QuestionTopicLink[],
  assignments: AssignmentMeta[],
  topics: TopicInfo[],
  scopedTopicsByExamType: ScopedTopicsByExamType
): AResult[]
```

Types:

```
AssignmentQuestion = { question_id: string; resource_id: string }
QuestionTopicLink  = { question_id: string; topic_id: string; relevance: number }
AssignmentMeta     = { resource_id: string; detected_exam_type: string | null }
TopicInfo          = { topic_id: string; module_id: string | null }
ScopedTopicsByExamType = Map<string, Set<string>>   // reuse from WTF

AResult = {
  topic_id: string
  module_id: string | null
  a_score: number          // normalized 0-1
  a_raw: number            // raw count (same as assignment_count)
  assignment_count: number  // distinct assignments touching this topic
}
```

Logic:
1. For each question-topic link with `relevance >= 0.4`:
   - Look up the assignment's `detected_exam_type`
   - Apply scope gate (same logic as WTF)
   - If passes → record `(topic_id, resource_id)` pair
2. For each topic: count distinct `resource_id`s = `assignment_count`
3. Group by `module_id`, normalize within module
4. Return results

### `trigger/tasks/compute-a.ts`

Task ID: `"compute-a"`
Payload: `{ subjectId: string }`

Follows compute-wtf pattern exactly:
1. Fetch assignment resources (`.in("resource_type", ["ASSIGNMENT"])`)
2. Fetch questions for those resources
3. Fetch question_topics
4. Fetch all topics for subject
5. Fetch exam_scopes + exam_scope_topics (same as compute-wtf)
6. Build scope map
7. Call `computeA()`
8. Upsert to `topic_a_scores`

Retry: maxAttempts 3, exponential backoff.

### `process-questions.ts` — MODIFY

After the existing WTF trigger (line ~837), add:

```
if (isAssignment) {
  try {
    await computeATask.trigger({ subjectId });
  } catch (err) {
    logger.warn("Failed to trigger A recomputation", { error: err });
  }
}
```

This ensures A only recomputes when an assignment is uploaded, not when test papers are uploaded.

---

## What Triggers When

| Upload Type | WTF Recompute | A Recompute |
|---|---|---|
| Test Paper | ✅ Yes | ❌ No |
| Assignment | ❌ No | ✅ Yes |
| PYQ | ✅ Yes | ❌ No |
| Notes | ❌ No | ❌ No |

WTF already filters to `TEST_PAPER` and `EXAM_PAPER` in its resource query. A filters to `ASSIGNMENT`. They are cleanly separated.

---

## Phase 2 Detailed Specs: UI & API

### `app/api/subjects/route.ts` — MODIFY

Add a PATCH handler:

```
PATCH /api/subjects
Body: { subject_id: string, config: { assignments_in_exam: boolean } }

Logic:
  1. Auth check (same as existing handlers)
  2. Verify subject belongs to user
  3. Merge incoming config into existing config (don't overwrite other keys)
     → SELECT config FROM subjects WHERE id = subject_id
     → merged = { ...existing_config, ...incoming_config }
     → UPDATE subjects SET config = merged WHERE id = subject_id
  4. Return success
```

This is a generic config updater — future flags ("has_practicals", etc.) work automatically.

### `app/dev-test/page.tsx` — MODIFY

**When the user clicks "📋 Assignments" to open the upload modal:**

1. Check if `subjects.config.assignments_in_exam` exists for this subject
2. If it does NOT exist (first-ever assignment upload):
   - Show a one-time inline prompt INSIDE the upload modal, ABOVE the file picker
   - This is NOT a separate modal — it's a section within the existing upload modal

**The prompt UI (conceptual):**

```
┌──────────────────────────────────────────────┐
│  📋 Upload Assignment                        │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  📌 Quick Question (asked once)        │  │
│  │                                        │  │
│  │  Do assignment topics typically        │  │
│  │  appear in your exams?                 │  │
│  │                                        │  │
│  │  [Yes, they do]  [No, not really]      │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌─ Drag & Drop Zone ─────────────────────┐  │
│  │  (file picker appears after answer     │  │
│  │   OR if already answered)              │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

**Behavior:**
- "Yes, they do" → PATCH subjects config with `{ assignments_in_exam: true }`
- "No, not really" → PATCH subjects config with `{ assignments_in_exam: false }`
- After answering → question disappears, file picker is revealed
- On subsequent assignment uploads → question is never shown again (config key exists)
- The prompt blocks the file picker until answered (first time only)

**Data flow:**
- `loadSubjects` already fetches subject data. Add `config` to the select query on the subjects API.
- Store `config` on the subject object in React state.
- Check `subject.config?.assignments_in_exam` in the upload modal render.

### `app/api/subjects/route.ts` — GET (existing)

The existing GET already returns subjects. Ensure `config` is included in the response. If the API uses `select("*")`, it's automatic after migration. If it selects specific columns, add `config`.

---

## Done Criteria

### Phase 1
- [ ] `subjects.config` JSONB column exists
- [ ] `topic_a_scores` table exists with RLS
- [ ] `lib/shared/exam-scope.ts` extracts scope utilities
- [ ] `lib/wtf/compute.ts` imports from shared (no local scope functions)
- [ ] `lib/a/compute.ts` implements scope-gated frequency counting + per-module normalization
- [ ] `trigger/tasks/compute-a.ts` follows compute-wtf pattern
- [ ] `trigger/index.ts` registers compute-a
- [ ] `process-questions.ts` triggers compute-a only for ASSIGNMENT uploads
- [ ] Relevance floor at 0.4 enforced
- [ ] Distinct resource_id counting (not question counting)
- [ ] Empty assignments → all A = 0
- [ ] No marks used anywhere (assignments have null marks)

### Phase 2
- [ ] PATCH handler on `/api/subjects` merges config safely
- [ ] Upload modal shows one-time "assignments in exam?" prompt
- [ ] Prompt only appears when `config.assignments_in_exam` is absent
- [ ] "Yes" / "No" saves to DB and reveals file picker
- [ ] Subsequent uploads skip the question entirely
- [ ] `loadSubjects` includes `config` in subject data

