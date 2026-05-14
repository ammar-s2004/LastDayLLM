# ETSM WTF (Weighted Topic Frequency) Signal — v2

## Overview

WTF measures **professor preference** by analyzing which topics appeared in past test papers and how much weight the professor gave them. The philosophy is dead simple:

- **Appeared = boost** (professor revealed preference)
- **Not appeared = neutral** (insufficient evidence, other signals decide)
- **No penalties, no absence logic, no paper-count adjustments**

Third signal in the ETSM pipeline, alongside SP (Syllabus Prior) and NC (Notes Coverage).

> No new AI calls. Pure DB aggregation of existing question extraction data.

---

## Architecture

### Signal Flow

```
Test paper uploaded
  → process-questions extracts questions + exam_type/year
  → questions + question_topics written to DB
  → compute-wtf triggered (non-blocking)
  → topic_wtf_scores updated (per-module normalization)
```

### Data Sources (All Already Exist)

| Table | What WTF reads |
|---|---|
| `questions` | `marks`, `resource_id`, `subject_id` |
| `question_topics` | `topic_id`, `relevance` |
| `resources` | `detected_exam_type`, `detected_exam_year`, `academic_year`, `created_at` |
| `topics` | `module_id` (for per-module grouping) |
| `exam_scopes` + `exam_scope_topics` | scoped topic_ids per exam_type (for module scope gate) |

---

## Core Formula

```
For each paper P in subject:
  paper_total_marks = SUM(marks) for all questions in P
  resolved_year     = detected_exam_year ?? academic_year ?? year(created_at)
  year_diff         = current_year - resolved_year
  ptw               = paper_type_weight(exam_type, year_diff)

  For each question Q in P:
    For each topic T mapped to Q via question_topics:

      // ── Module Scope Gate ──
      if P is TT-type AND T.topic_id NOT in exam scope for this exam_type:
        SKIP  ← prevents cross-module noise

      marks_fraction = marks(Q) / paper_total_marks
      WTF_raw(T)    += relevance(Q,T) × marks_fraction × ptw

// ── Per-Module Normalization ──
For each module M in subject:
  max_raw_M = max(WTF_raw) among topics in M
  For each topic T in M:
    WTF(T) = WTF_raw(T) / max_raw_M

  if max_raw_M == 0:
    WTF(T) = 0 for all T in M   ← no data, no boost, no penalty
```

---

## Key Design Decisions

### 1. Per-Module Normalization (Not Per-Subject)

The prediction engine operates per-module. Subject-level normalization creates cross-module competition:

```
Subject-level (WRONG):
  M1 topic: WTF_raw=0.8 → WTF=1.00
  M5 topic: WTF_raw=0.4 → WTF=0.50  ← unfairly penalized

Per-module (CORRECT):
  M1: max_raw=0.8, topic → WTF=1.00
  M5: max_raw=0.4, topic → WTF=1.00  ← correctly the most-asked in M5
```

### 2. Module Scope Enforcement via Exam Scopes

TT papers should only contribute WTF to topics in their covered modules. Instead of adding a new field, we use the **existing exam scope configuration**:

```
Paper exam_type = END_SEMESTER or UNKNOWN:
  → all topics eligible (end sem covers everything)

Paper exam_type = TT1:
  → only count topics present in user's TT1 exam scope

Paper exam_type = TT2:
  → only count topics present in user's TT2 exam scope

No scope found for exam_type:
  → graceful fallback, count all topics
```

**Why this is semantically correct**: The prediction is for the CURRENT exam. A historical TT1 might have covered M1-M3, but if the student's current TT1 scope is M1-M2, we only care about professor preference within M1-M2.

**Why not a new field**: No UI changes. No extraction pipeline changes. One extra DB query. Data already exists.

### 3. Assignments Excluded

Assignments are a separate signal (A signal). Filter: `resource_type IN ('TEST_PAPER', 'EXAM_PAPER')` only.

### 4. Full Recompute Per Subject

WTF recomputes ALL papers for a subject every time a new paper is added. Data is small, consistency is worth more than optimization.

---

## Paper Type Weights

```
resolved_year = detected_exam_year ?? academic_year ?? year(created_at)
year_diff     = current_year - resolved_year
```

| Condition | Weight | Rationale |
|---|---|---|
| This year TT1/TT2 | **1.00** | Strongest signal — same professor, same semester |
| This year End Sem | **1.00** | Exists for completeness; rare to have before prediction |
| Last year End Sem | **0.90** | Strong — professor's comprehensive exam choices |
| Last year TT | **0.70** | Good — but TTs may shift year to year |
| Older End Sem (2+ years) | **0.50** | Useful but curriculum/professor may have changed |
| Older TT (2+ years) | **0.30** | Weakest signal — still informative |
| Unknown type | **0.50** | Conservative default |

---

## Edge Cases

| Scenario | Handling |
|---|---|
| `marks IS NULL` | Treat as `1.0` (equal weight with other questions) |
| Paper with ALL null marks | Each question contributes `1/question_count` |
| `paper_total_marks = 0` | Each question contributes `1/question_count` |
| Module has no papers covering it | WTF = 0 for all topics in that module (neutral) |
| Only 1 paper, 1 question, 1 topic | Topic gets WTF=1.0 within its module |
| Topic not in any paper | WTF = 0 (no penalty — SP/NC carry it) |
| `detected_exam_type = 'UNKNOWN'` | Weight = 0.50, no module scope filter |
| No year detected | Fallback: `academic_year` → `year(created_at)` |
| No exam scope for paper's exam_type | Graceful fallback: count all topics |

### Exam Type Normalization

`detected_exam_type` values from `process-questions.ts` Zod schema:

```
TT1         → TT weight (by year_diff)
TT2         → TT weight (by year_diff)
END_SEMESTER → End Sem weight (by year_diff)
UNKNOWN      → 0.50 default, no module scope filter
```

PYQ task uses different enum but maps cleanly: `MID_SEM → TT`, `END_SEM → End Sem`

---

## Implementation — Single Phase

### Step 1: Migration — `topic_wtf_scores`

**File:** `supabase/migrations/20260412000000_add_wtf_scores.sql`

```sql
CREATE TABLE topic_wtf_scores (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id    UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    module_id     UUID REFERENCES modules(id) ON DELETE SET NULL,
    topic_id      UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    wtf_score     DOUBLE PRECISION NOT NULL,  -- normalized 0-1 WITHIN MODULE
    wtf_raw       DOUBLE PRECISION NOT NULL,  -- pre-normalization value
    question_count INTEGER NOT NULL DEFAULT 0, -- questions contributing
    paper_count    INTEGER NOT NULL DEFAULT 0, -- distinct papers contributing
    computed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (topic_id)
);

CREATE INDEX idx_wtf_scores_subject ON topic_wtf_scores(subject_id);

ALTER TABLE topic_wtf_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wtf_scores_service_all" ON topic_wtf_scores
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "wtf_scores_user_read" ON topic_wtf_scores
    FOR SELECT TO authenticated
    USING (subject_id IN (SELECT id FROM subjects WHERE user_id = auth.uid()));
```

---

### Step 2: Compute Function — `lib/wtf/compute.ts`

**Pure computation, no DB access. Testable in isolation.**

#### Input Types

```ts
interface PaperQuestion {
  question_id: string;
  marks: number | null;
  resource_id: string;
}

interface QuestionTopicLink {
  question_id: string;
  topic_id: string;
  relevance: number;
}

interface PaperMeta {
  resource_id: string;
  detected_exam_type: string | null;
  detected_exam_year: string | null;
  academic_year: number | null;
  created_at: string;
}

interface TopicInfo {
  topic_id: string;
  module_id: string | null;
}

// Map from exam_type → Set of allowed topic_ids
type ScopedTopicsByExamType = Map<string, Set<string>>;
```

#### Output Type

```ts
interface WTFResult {
  topic_id: string;
  module_id: string | null;
  wtf_score: number;      // normalized 0-1 within module
  wtf_raw: number;         // pre-normalization
  question_count: number;
  paper_count: number;
}
```

#### Functions

1. **`resolveYear(meta: PaperMeta): number`**
   - Returns `detected_exam_year` → `academic_year` → `year(created_at)`

2. **`getPaperTypeWeight(examType: string | null, yearDiff: number): number`**
   - Lookup table. TT vs End Sem × year_diff.

3. **`computeWTF(questions, links, papers, topics, scopedTopicsByExamType, currentYear): WTFResult[]`**
   - Groups questions by `resource_id` (by paper)
   - For each paper: applies module scope gate (TT → filter by scoped topics)
   - Computes `paper_total_marks`, `marks_fraction` per question
   - Accumulates `WTF_raw` per topic
   - Groups topics by `module_id`
   - Normalizes within each module
   - Returns array of results

**Must NOT**: access DB, import Supabase client, make AI calls.

---

### Step 3: Barrel Export — `lib/wtf/index.ts`

```ts
export * from "./compute";
```

---

### Step 4: Trigger Task — `trigger/tasks/compute-wtf.ts`

**Task ID:** `"compute-wtf"` | **Payload:** `{ subjectId: string }`

**Steps:**

1. Fetch subject's `user_id` from `subjects` table
2. Fetch all questions for subject (join `resources` for paper metadata)
   - Filter: `resource_type IN ('TEST_PAPER', 'EXAM_PAPER')`, `status IN ('COMPLETED', 'PARTIAL')`
3. Fetch all `question_topics` links for those questions
4. Fetch all topics with `module_id` for the subject
5. Fetch user's exam scopes + scope topics → build `scopedTopicsByExamType` map
6. Call `computeWTF()`
7. Batch upsert into `topic_wtf_scores` (`ON CONFLICT (topic_id) DO UPDATE`)
8. Log summary

**Retry:** maxAttempts: 3, exponential backoff (same as compute-sp).

---

### Step 5: Wire Triggers

**`trigger/tasks/process-questions.ts`** — after COMPLETE block (~line 833), before cleanup:

```ts
// Trigger WTF recomputation (non-blocking)
try {
  await computeWTFTask.trigger({ subjectId });
} catch (err) {
  logger.warn("Failed to trigger WTF recomputation", { error: err });
}
```

**`trigger/tasks/process-pyq.ts`** — after COMPLETE block (~line 263), before cleanup:

```ts
import { computeWTFTask } from "./compute-wtf";
// ...
try {
  await computeWTFTask.trigger({ subjectId: payload.subjectId });
} catch (err) {
  logger.warn("Failed to trigger WTF recomputation", { error: err });
}
```

---

## What Codex Must NOT Touch

- `lib/sp/` — SP signal (done)
- `lib/nc/` — NC signal (done)
- `lib/extraction/` — Notes extraction pipeline
- `app/api/` — No API route changes
- `lib/ai-prompts.ts` — No prompt changes
- Question extraction logic in existing tasks — only ADD trigger calls at the end

---

## Done Criteria

- [ ] `topic_wtf_scores` table exists with RLS
- [ ] `lib/wtf/compute.ts` implements per-module normalization
- [ ] `lib/wtf/compute.ts` implements module scope gate via exam scopes
- [ ] `lib/wtf/index.ts` barrel export exists
- [ ] `trigger/tasks/compute-wtf.ts` follows compute-sp pattern
- [ ] `process-questions.ts` triggers compute-wtf after completion
- [ ] `process-pyq.ts` triggers compute-wtf after completion
- [ ] Assignments excluded (resource_type filter)
- [ ] Year fallback chain: `detected_exam_year → academic_year → year(created_at)`
- [ ] Marks normalization is per-paper
- [ ] WTF = 0 for topics not in any paper (no penalty)
- [ ] Normalization is per-module, not per-subject
- [ ] TT papers only contribute to topics in their exam scope
