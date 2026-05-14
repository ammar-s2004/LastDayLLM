# ETSM TE (Teacher Emphasis) Signal — Implementation Plan

## Overview

TE is the most direct signal in ETSM. Student types everything their teacher hinted — one shot, night before exam. LLM reads it, distributes emphasis across topics using the hint text plus contextual data from the existing NC and WTF pipelines.

Philosophy: **teacher said it → it's coming. Period.**

---

## What Already Exists

The `teacher_hints` table and API route are already live:

| Component | Status | Details |
|---|---|---|
| `teacher_hints` table | ✅ Exists | `id, subject_id, exam_label, exam_type, hint_text, created_at` |
| `lib/hints.ts` | ✅ Exists | Parses `hint_text` JSON into `teacherHints` + `paperPattern` |
| `app/api/subjects/teacher-hints/route.ts` | ✅ Exists | GET/POST, upserts by subject_id |
| UI (text input) | ✅ Exists | Student enters hints in the subject dashboard |

**What does NOT exist**: confidence tagging, TE score computation, topic_te_scores storage.

### Existing `teacher_hints` Schema

```
id            UUID PK
subject_id    UUID FK
exam_label    TEXT (nullable — currently unused for general hints)
exam_type     USER-DEFINED (nullable — currently unused for general hints)
hint_text     TEXT (JSON: { teacherHints: "...", paperPattern: "..." })
created_at    TIMESTAMPTZ
```

The current API queries where `exam_type IS NULL AND exam_label IS NULL` to get the "general" hint for a subject.

---

## Architecture Changes

### Schema Changes to `teacher_hints`

Add one column:

```
confidence    TEXT NOT NULL DEFAULT 'EXACT'
              CHECK (confidence IN ('EXACT', 'VAGUE', 'INFERRED'))
```

**Why not a new table?** The table already exists, the API already works, the UI already submits to it. Adding a column is cleaner than creating a parallel table.

### New Table: `topic_te_scores`

```
id            UUID PK
subject_id    UUID FK → subjects(id) ON DELETE CASCADE
module_id     UUID FK → modules(id) ON DELETE SET NULL
topic_id      UUID FK → topics(id) ON DELETE CASCADE
te_score      DOUBLE PRECISION NOT NULL   -- normalized 0-1 within module
te_raw        DOUBLE PRECISION NOT NULL   -- pre-normalization (emphasis × confidence)
reason        TEXT                         -- LLM's reasoning, stored for UI/debug
computed_at   TIMESTAMPTZ NOT NULL DEFAULT now()

UNIQUE (topic_id)   -- one score per topic, recomputed on each hint submit
```

RLS: same pattern as topic_wtf_scores (service_role full, authenticated read own subjects).

---

## Confidence Scalar

| Level | Scalar | Meaning |
|---|---|---|
| `EXACT` | **1.00** | Teacher said it directly |
| `VAGUE` | **0.60** | Student not 100% sure |
| `INFERRED` | **0.30** | Student's own reading of the situation |

---

## LLM Input: What the Model Sees

For each topic, we can already query the following from existing tables:

### From `topics` table
- `name` — topic name
- `sub_topics` — JSONB array of subtopic names

### From `nc_scores.depth_breakdown` (JSONB — already stored per topic)
- `has_derivation` — boolean
- `has_worked_example` — boolean
- `has_diagram` — boolean
- `has_code` — boolean
- `mention_density` — float (how often it appears in notes)

### From `topic_wtf_scores`
- `wtf_score` — float 0-1 (how frequently professor asks about this topic)
- `question_count` — int (how many past questions touch this topic)

### Prompt Structure (Conceptual)

```
SYSTEM: You are an exam prediction assistant. The student has shared
hints from their teacher about what topics are important for the
upcoming exam. Your job is to distribute emphasis across all topics
based on the hints.

For each topic, assign an emphasis_score from 0.0 to 1.0:
- 1.0 = teacher explicitly and strongly emphasized this
- 0.7-0.9 = strongly implied or related to something explicitly mentioned
- 0.3-0.6 = partially related, indirect mention
- 0.0-0.2 = not mentioned at all, no connection to hints

STUDENT'S TEACHER HINTS:
"{hint_text}"

TOPICS TO SCORE:
[
  {
    "topic_id": "t_001",
    "name": "Transformer Architecture",
    "subtopics": ["encoders", "decoders", "attention mechanism"],
    "notes_have_derivation": true,
    "notes_have_worked_example": true,
    "notes_have_diagram": false,
    "professor_frequency_score": 0.85,
    "past_question_count": 4
  },
  ...
]

Respond with JSON array:
[
  {
    "topic_id": "t_001",
    "emphasis_score": 0.95,
    "reason": "teacher explicitly mentioned transformer numericals"
  },
  ...
]
```

### Why Enrich Beyond Just Hint Text

The NC and WTF data help the LLM make better decisions:

| Hint says | NC depth_breakdown says | WTF says | LLM infers |
|---|---|---|---|
| "numericals important" | topic has derivations + worked examples | topic asked 4 times | High emphasis — confirmed from all angles |
| "numericals important" | topic has NO derivations | topic never asked | Lower emphasis — hint might refer to a different topic |
| "focus on unit 5" | topic in module 5 has code examples | topic asked twice | Medium-high — "focus on unit 5" is vague but topic is active |

Without enrichment, the LLM guesses. With enrichment, the LLM calibrates.

### Aggregating NC Data Across Multiple Note Files

A topic may have NC scores from multiple uploaded note files. For the TE enrichment, we need ONE signal per topic:

```
For each topic T:
  nc_rows = all nc_scores rows for T
  if nc_rows is empty:
    has_derivation = false, has_worked_example = false, etc.
  else:
    has_derivation = ANY(row.depth_breakdown.has_derivation) across all files
    has_worked_example = ANY(row.depth_breakdown.has_worked_example)
    has_diagram = ANY(row.depth_breakdown.has_diagram)
    has_code = ANY(row.depth_breakdown.has_code)
```

Use OR aggregation: if ANY note file has a derivation for this topic, report `has_derivation: true`. This is the most useful signal for the LLM.

---

## Compute Flow

### Step 1 — Gather Data

1. Fetch teacher hint for subject from `teacher_hints`
2. Parse `hint_text` → extract `teacherHints` string
3. Fetch all topics + subtopics for subject
4. Fetch NC depth_breakdown per topic (aggregate across note files via OR)
5. Fetch WTF scores per topic

### Step 2 — One LLM Call

- Model: `gemini-2.5-flash-lite` (same as question extraction — fast, cheap)
- Input: structured prompt with hint text + enriched topic list
- Output: JSON array of `{ topic_id, emphasis_score, reason }`
- Validation: Zod schema to ensure scores are 0-1, topic_ids match

### Step 3 — Apply Confidence Scalar

```
TE_raw(T) = emphasis_score(T) × confidence_scalar
```

### Step 4 — Per-Module Normalization

```
For each module M:
  max_raw_M = max(TE_raw) among topics in M
  TE(T) = TE_raw(T) / max_raw_M   if max_raw_M > 0
        = 0                         if max_raw_M == 0
```

### Step 5 — Upsert to `topic_te_scores`

Batch upsert with `ON CONFLICT (topic_id) DO UPDATE`.

---

## Teacher Floor (Scoring Engine Concern)

> [!IMPORTANT]
> The teacher floor is NOT implemented in the TE computation. It's applied later in the scoring engine when combining SP + NC + WTF + TE into the final prediction score. Documenting here for context.

```
if TE(T) >= 0.75:
  teacher_floor = 0.65
  FinalScore(T) = max(FinalScore(T), teacher_floor)
```

Teacher said it's coming → cannot fall below HIGH, regardless of what other signals say.

---

## When TE Is Absent

```
Student enters no hints:
  → TE = 0 for all topics
  → TE weight (0.20) redistributes to WTF, SP, NC
  → No teacher floor applied anywhere
  → System runs on remaining three signals
```

No special handling needed. TE scores simply don't exist or are all zero.

---

## Raw Hints Feed Answer Generation

This is a downstream concern (answer generation phase), but worth noting:

```
Answer generation receives:
  1. Ranked topic list (from prediction engine)
  2. Raw hint_text (from teacher_hints table)

"sir said transformer numericals are important"
  → model generates numerical-focused answers
  → not generic theory

The hint text shapes the NATURE of the answer, not just the ranking.
```

---

## Trigger Strategy

```
Student submits/updates hints via existing API route
  → POST /api/subjects/teacher-hints
  → API saves to teacher_hints table (existing behavior, unchanged)
  → API triggers compute-te task (NEW — non-blocking)
  → Trigger.dev task runs LLM + computes scores
  → topic_te_scores updated
```

One-shot. No recompute triggers from other pipelines.
If student updates hints, the API fires compute-te again, which does a full recompute.

---

## Edge Cases

| Scenario | Handling |
|---|---|
| Empty hint_text | Skip LLM call, set all TE = 0 |
| Hint mentions topic not in syllabus | LLM ignores (only scores existing topics) |
| No NC data (no notes uploaded yet) | Pass `has_*: false` for all — LLM works with hint + WTF only |
| No WTF data (no papers uploaded yet) | Pass `wtf_score: 0, question_count: 0` — LLM works with hint + NC only |
| Neither NC nor WTF data | LLM works with hint text + topic names + subtopics + its own knowledge |
| LLM returns topic_id not in our list | Filter out, don't crash |
| LLM returns emphasis_score > 1 or < 0 | Clamp to [0, 1] |
| Student updates hint (resubmit) | Full recompute — old te_scores overwritten via upsert |
| Multiple note files for same topic | OR-aggregate depth_breakdown booleans |

---

## Files to Create/Modify

### Phase 1 — Migration + Core + Task + API Wiring

| # | File | Action | Purpose |
|---|---|---|---|
| 1 | `supabase/migrations/20260412100000_add_te_signal.sql` | CREATE | Add `confidence` column to `teacher_hints`, create `topic_te_scores` table |
| 2 | `lib/te/compute.ts` | CREATE | Pure function: apply confidence scalar + per-module normalization |
| 3 | `lib/te/prompt.ts` | CREATE | Build the LLM prompt with enriched topic data |
| 4 | `lib/te/index.ts` | CREATE | Barrel export |
| 5 | `trigger/tasks/compute-te.ts` | CREATE | Trigger.dev task: fetch data → LLM call → compute → upsert |
| 6 | `app/api/subjects/teacher-hints/route.ts` | MODIFY | After upsert, trigger `compute-te` task (non-blocking) |

### What NOT to Touch

- `lib/sp/`, `lib/nc/`, `lib/wtf/` — other signals
- `lib/extraction/` — notes extraction
- `lib/hints.ts` — existing parser (still works, no changes needed)
- `trigger/tasks/process-questions.ts` — question pipeline
- `trigger/tasks/process-pyq.ts` — PYQ pipeline
- `trigger/tasks/process-notes-qdrant.ts` — notes pipeline
- UI components — frontend changes are separate scope

---

## Detailed File Specs

### Migration: `20260412100000_add_te_signal.sql`

1. ALTER `teacher_hints` — add `confidence TEXT NOT NULL DEFAULT 'EXACT' CHECK (confidence IN ('EXACT', 'VAGUE', 'INFERRED'))`
2. CREATE TABLE `topic_te_scores` — same pattern as `topic_wtf_scores`
3. CREATE INDEX on `topic_te_scores(subject_id)`
4. ENABLE RLS + policies (service_role all, authenticated read own)

### `lib/te/prompt.ts`

Exports one function: `buildTEPrompt(hintText, enrichedTopics) → string`

Input type `EnrichedTopic`:
```
topic_id: string
name: string
subtopics: string[]
has_derivation: boolean
has_worked_example: boolean
has_diagram: boolean
has_code: boolean
wtf_score: number
question_count: number
```

Returns the full prompt string ready for Gemini.

### `lib/te/compute.ts`

Pure functions, no DB access:

1. `getConfidenceScalar(confidence: string): number` — returns 1.0 / 0.6 / 0.3
2. `computeTE(emphasisScores, confidence, topics): TEResult[]`
   - Receives raw emphasis_scores from LLM output + confidence level + topic module_ids
   - Applies confidence scalar: `te_raw = emphasis × scalar`
   - Groups by module_id, normalizes within module
   - Returns array of `{ topic_id, module_id, te_score, te_raw, reason }`

### `trigger/tasks/compute-te.ts`

Task ID: `"compute-te"`
Payload: `{ subjectId: string }`

Steps:
1. Fetch teacher_hints for subject (where exam_type IS NULL, exam_label IS NULL)
2. Parse hint_text via `parseCombinedHints()` → get teacherHints string
3. If empty → upsert all topics with TE = 0, return early
4. Fetch all topics + sub_topics for subject
5. Fetch NC depth_breakdown: query `nc_scores` for all topics, OR-aggregate booleans across files
6. Fetch WTF scores: query `topic_wtf_scores` for all topics
7. Build enriched topic list
8. Call `buildTEPrompt()` → call Gemini → parse + validate response
9. Call `computeTE()` with LLM output + confidence
10. Batch upsert to `topic_te_scores`

Retry: maxAttempts 3, exponential backoff.

### API Route Modification: `teacher-hints/route.ts`

In the POST handler, after the existing upsert succeeds (line ~111), add a non-blocking trigger:

```
// After successful upsert of hint:
try {
  await tasks.trigger("compute-te", { subjectId: subject_id });
} catch (err) {
  console.warn("Failed to trigger TE computation", err);
}
```

Import `tasks` from `@trigger.dev/sdk/v3`. The API route runs server-side so this is safe.

> [!WARNING]
> The API route uses the user-facing Supabase client (RLS-aware). The Trigger.dev task needs the service role client. Make sure compute-te.ts creates its own admin client, same as compute-wtf.ts.

---

## Model + Cost

- **Model**: `gemini-2.5-flash-lite`
- **Input tokens**: ~2000 (prompt + 30-50 topics with enrichment)
- **Output tokens**: ~500 (JSON array of scores + reasons)
- **Cost**: effectively free at current rates
- **Latency**: <5 seconds
- **Runs**: Once per hint submit. Most students submit once.

---

## Done Criteria

- [ ] `teacher_hints.confidence` column exists with CHECK constraint
- [ ] `topic_te_scores` table exists with RLS
- [ ] `lib/te/prompt.ts` builds enriched prompt
- [ ] `lib/te/compute.ts` implements confidence scalar + per-module normalization
- [ ] `trigger/tasks/compute-te.ts` exists, follows compute-wtf pattern
- [ ] LLM output validated with Zod (emphasis_score clamped 0-1)
- [ ] NC depth_breakdown OR-aggregated across note files
- [ ] WTF scores passed to LLM as enrichment
- [ ] API route triggers compute-te after hint upsert
- [ ] Empty hint → all TE = 0, no LLM call
- [ ] Student re-submit → full recompute via upsert
- [ ] `reason` field stored per topic (for UI/debug later)
