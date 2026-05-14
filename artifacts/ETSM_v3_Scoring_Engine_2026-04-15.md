# ETSM v3 Scoring Engine — Implementation Plan

**Architect:** Opus 4.6  
**Date:** 2026-04-15  
**Scope:** Build the fusion engine that combines all 5 pre-computed signals into ranked topic predictions.

---

## Database — Already Applied ✅

Two migrations have been applied to the live database (project: `kqehnjoyrejsfcfzssoc`):

1. **`subjects.college_assignment_factor`** — `NUMERIC NOT NULL DEFAULT 0.0` with CHECK constraint `IN (0.0, 0.3, 0.6, 1.0)`
2. **`teacher_hints.confidence`** — constraint expanded to include `'GUESS'` alongside `'EXACT'`, `'VAGUE'`, `'INFERRED'`
3. **`lib/te/compute.ts`** — `getConfidenceScalar()` updated to map `GUESS → 0.3` (same as INFERRED)

**No further migrations needed.**

---

## Signal ↔ DB Column Reference

| Signal | Source Table | Source Column | Notes |
|--------|-------------|---------------|-------|
| SP | `topic_sp_scores` | `centrality_score` | Always active |
| NC | `nc_scores` | `nc_file_score × file_weight` | Always active. Weighted aggregate per topic |
| WTF | `topic_wtf_scores` | `wtf_score` | Active if any TEST_PAPER/EXAM_PAPER resources exist |
| TE | `topic_te_scores` | `te_score` | Active if hint_text is non-empty |
| A | `topic_a_scores` | `a_score` | Active if assignments exist AND `college_assignment_factor > 0` |

## SubjectContext Derivation Reference

| Field | Source |
|-------|--------|
| `has_papers` | `resources` → any row with `resource_type IN ('TEST_PAPER','EXAM_PAPER')` AND `status IN ('COMPLETED','PARTIAL')` |
| `has_assignments` | `resources` → any row with `resource_type = 'ASSIGNMENT'` AND `status IN ('COMPLETED','PARTIAL')` |
| `has_hints` | `teacher_hints` WHERE `exam_type IS NULL AND exam_label IS NULL` → row exists AND parsed `teacherHints` is non-empty |
| `hint_confidence_scalar` | From that same hint's `confidence` column via `getConfidenceScalar()` |
| `college_assignment_factor` | `subjects.college_assignment_factor` — dedicated numeric column |

## Output Column Mapping (prediction_topic_scores)

| Engine Field | DB Column |
|---|---|
| `signals.SP` | `p_prior` |
| `signals.NC` | `e_notes` |
| `signals.WTF` | `f_tests` |
| `signals.TE` | `e_teacher` |
| `signals.A` | `f_assign` |
| `base_score` | `base_score` |
| `synergy_bonus` | `synergy_score` |
| `teacher_floor_applied` | `teacher_floor` |
| `final_score` | `final_score` |
| `band` | `band` (enum: HIGH/MEDIUM/LOW) |

---

## Phase 1 — Core Fusion Engine (Pure Math, Zero IO)

Pure TypeScript module. No Supabase, no env vars, no network calls.

### Files to Create

#### `lib/etsm/types.ts`

```typescript
export type SignalKey = "SP" | "NC" | "WTF" | "TE" | "A";
export type PriorityBand = "HIGH" | "MEDIUM" | "LOW";

export interface SubjectContext {
  has_papers: boolean;
  has_assignments: boolean;
  has_hints: boolean;
  hint_confidence_scalar: number;        // 1.0 | 0.6 | 0.3
  college_assignment_factor: number;     // 1.0 | 0.6 | 0.3 | 0.0
}

export interface TopicData {
  topic_id: string;
  module_id: string;
  signals: Record<SignalKey, number>;    // each value [0.0, 1.0]
}

export interface ScoredTopic extends TopicData {
  base_score: number;
  synergy_bonus: number;
  teacher_floor_applied: number;         // 0 if not triggered, 0.65 if triggered
  final_score: number;
  band: PriorityBand;
  rank: number;                          // 1-indexed within module, ascending
}
```

#### `lib/etsm/engine.ts`

Class `ETSMFusionEngine`. Import all types from `./types`. No other imports.

**Method 1: `buildActiveWeights(ctx: SubjectContext): Partial<Record<SignalKey, number>>`**

- SP always active: raw weight `0.18`
- NC always active: raw weight `0.10`
- WTF: raw weight `0.28` if `ctx.has_papers`, else omit
- TE: raw weight `0.32 * ctx.hint_confidence_scalar` if `ctx.has_hints`, else omit
- A: raw weight `0.12 * ctx.college_assignment_factor` if `ctx.has_assignments && ctx.college_assignment_factor > 0`, else omit
- Sum all active raw weights → `total`
- Guard: if `total === 0`, return `{ SP: 0.64, NC: 0.36 }` (impossible in practice but safe)
- Normalize: divide each raw weight by `total` → return normalized weights

**Method 2: `scoreTopic(topic: TopicData, weights: Partial<Record<SignalKey, number>>, ctx: SubjectContext): ScoredTopic`**

1. `baseScore = 0`; iterate over each `key` in `weights`: `baseScore += weights[key]! * topic.signals[key]`
2. Count `strongCount` = number of keys in `weights` where `topic.signals[key] >= 0.60`
3. `synergyBonus = 0.04 * Math.max(0, strongCount - 1)`
4. `rawScore = baseScore + synergyBonus`
5. `teacherFloor = (ctx.has_hints && topic.signals.TE >= 0.75 && ctx.hint_confidence_scalar >= 0.6) ? 0.65 : 0`
6. `finalScore = Math.min(1.0, Math.max(rawScore, teacherFloor))`
7. Return `ScoredTopic` with `base_score`, `synergy_bonus`, `teacher_floor_applied`, `final_score`, `band: "LOW"` (placeholder), `rank: 0` (placeholder)

**Method 3: `rankModule(topics: TopicData[], ctx: SubjectContext): ScoredTopic[]`**

1. `weights = this.buildActiveWeights(ctx)`
2. `scored = topics.map(t => this.scoreTopic(t, weights, ctx))`
3. Sort `scored` descending by `final_score`
4. Separate into two groups:
   - `garbage`: where `final_score < 0.25`
   - `rankable`: where `final_score >= 0.25`
5. From `rankable` (length = N):
   - `highCount = Math.ceil(N * 0.30)`
   - `mediumCount = Math.round(N * 0.40)`
   - Indices `0..highCount-1` → band `"HIGH"`
   - Indices `highCount..highCount+mediumCount-1` → band `"MEDIUM"`
   - Remaining → band `"LOW"`
6. Assign `rank` starting at 1, incrementing through `rankable` then `garbage`
7. All `garbage` topics → band `"LOW"`
8. Return `[...rankable, ...garbage]` (maintain sort order within each group)

#### `lib/etsm/index.ts`

```typescript
export * from "./types";
export * from "./engine";
```

> **Do NOT export `./collect` yet** — that file does not exist in Phase 1. It will be added in Phase 2.

### What NOT to Touch in Phase 1
- Nothing outside `lib/etsm/`
- No database imports anywhere
- No `process.env` access anywhere

### Done Criteria — Phase 1
- [ ] `lib/etsm/types.ts` exists
- [ ] `lib/etsm/engine.ts` exists with `ETSMFusionEngine` class
- [ ] `lib/etsm/index.ts` exports types and engine only
- [ ] `npm run build` passes with zero TypeScript errors

---

## Phase 2 — Signal Collector, Trigger Task, API Route

### Files to Create / Modify

#### [NEW] `lib/etsm/collect.ts`

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCombinedHints } from "@/lib/hints";
import { getConfidenceScalar } from "@/lib/te/compute";
import type { SubjectContext, TopicData } from "./types";

export async function collectSignals(
  supabase: SupabaseClient,
  subjectId: string
): Promise<{
  topics: TopicData[];
  context: SubjectContext;
  moduleMap: Map<string, number>;
}>
```

**Implementation — execute all fetches in parallel via `Promise.all`:**

```
Fetch simultaneously:
  a. topics           → supabase.from("topics").select("id, module_id").eq("subject_id", subjectId)
  b. modules          → supabase.from("modules").select("id, module_no").eq("subject_id", subjectId).order("module_no")
  c. spRows           → supabase.from("topic_sp_scores").select("topic_id, centrality_score").eq("subject_id", subjectId)
  d. ncRows           → supabase.from("nc_scores").select("topic_id, nc_file_score, file_weight").eq("subject_id", subjectId)
  e. wtfRows          → supabase.from("topic_wtf_scores").select("topic_id, wtf_score").eq("subject_id", subjectId)
  f. teRows           → supabase.from("topic_te_scores").select("topic_id, te_score").eq("subject_id", subjectId)
  g. aRows            → supabase.from("topic_a_scores").select("topic_id, a_score").eq("subject_id", subjectId)
  h. subjectRow       → supabase.from("subjects").select("college_assignment_factor").eq("id", subjectId).single()
  i. hintRow          → supabase.from("teacher_hints").select("hint_text, confidence")
                          .eq("subject_id", subjectId).is("exam_type", null).is("exam_label", null)
                          .limit(1).maybeSingle()
  j. resourceRows     → supabase.from("resources").select("resource_type")
                          .eq("subject_id", subjectId).in("status", ["COMPLETED", "PARTIAL"])
```

Throw on any Supabase error.

**Build Maps:**

```
spMap: Map<topic_id, centrality_score>
wtfMap: Map<topic_id, wtf_score>
teMap: Map<topic_id, te_score>
aMap: Map<topic_id, a_score>

ncMap: Map<topic_id, aggregated_nc_score>
  For each topic_id in ncRows:
    numerator += nc_file_score * file_weight
    denominator += file_weight
  ncMap[topic_id] = denominator === 0 ? 0 : Math.min(1, numerator / denominator)

moduleMap: Map<module_id (UUID), module_no (number)>
```

**Build SubjectContext:**

```typescript
const parsedHint = parseCombinedHints(hintRow?.hint_text);
const hasHints = parsedHint.teacherHints.trim().length > 0;

const context: SubjectContext = {
  has_papers: resourceRows.some(r =>
    r.resource_type === "TEST_PAPER" || r.resource_type === "EXAM_PAPER"
  ),
  has_assignments: resourceRows.some(r => r.resource_type === "ASSIGNMENT"),
  has_hints: hasHints,
  hint_confidence_scalar: hasHints
    ? getConfidenceScalar(hintRow?.confidence ?? "EXACT")
    : 1.0,
  college_assignment_factor: subjectRow?.college_assignment_factor ?? 0.0,
};
```

**Build TopicData[]:**

```typescript
const topics: TopicData[] = [];
for (const topic of topicRows) {
  if (!topic.module_id) {
    console.warn("[collectSignals] Topic missing module_id, skipping", { topic_id: topic.id });
    continue;
  }
  topics.push({
    topic_id: topic.id,
    module_id: topic.module_id,
    signals: {
      SP: spMap.get(topic.id) ?? 0,
      NC: ncMap.get(topic.id) ?? 0,
      WTF: wtfMap.get(topic.id) ?? 0,
      TE: teMap.get(topic.id) ?? 0,
      A: aMap.get(topic.id) ?? 0,
    },
  });
}
```

Return `{ topics, context, moduleMap }`.

---

#### [MODIFY] `lib/etsm/index.ts`

Add one line:
```typescript
export * from "./collect";
```

---

#### [NEW] `trigger/tasks/run-prediction.ts`

Follow the **exact structural pattern** of `trigger/tasks/compute-wtf.ts`:
- Same `getSupabaseAdmin()` helper (copy verbatim)
- Same `task()` import from `@trigger.dev/sdk`
- Same `logger` usage
- Same retry config: `maxAttempts: 3, factor: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 15000`

**Task ID:** `"run-prediction"`

**Payload type:**
```typescript
{
  subjectId: string;
  userId: string;
  examType?: string;
  examLabel?: string;
  moduleNos?: number[];
}
```

**Imports:**
```typescript
import { task, logger } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";
import { collectSignals } from "@/lib/etsm/collect";
import { ETSMFusionEngine } from "@/lib/etsm/engine";
import type { ScoredTopic } from "@/lib/etsm/types";
```

**Run logic:**

```
1. supabase = getSupabaseAdmin()

2. logger.info("[run-prediction] Starting", { subjectId: payload.subjectId })

3. { topics, context, moduleMap } = await collectSignals(supabase, payload.subjectId)

4. Determine modulesInScope (number[]):
   If payload.moduleNos provided:
     filter topics to those whose moduleMap.get(topic.module_id) is in payload.moduleNos
     modulesInScope = payload.moduleNos
   Else:
     modulesInScope = [...new Set([...moduleMap.values()])]

5. Group filtered topics by module_id → Map<string, TopicData[]>

6. engine = new ETSMFusionEngine()
   allScored: ScoredTopic[] = []
   For each [moduleId, moduleTopics] of grouped map:
     ranked = engine.rankModule(moduleTopics, context)
     allScored.push(...ranked)

7. Insert prediction_runs row:
   { subject_id, user_id, exam_type, exam_label, modules_in_scope }
   .select("id").single()
   → predictionRunId

8. If allScored.length > 0:
   batch insert prediction_topic_scores:
   allScored.map(s => ({
     prediction_run_id: predictionRunId,
     topic_id: s.topic_id,
     p_prior:       s.signals.SP,
     e_notes:       s.signals.NC,
     f_tests:       s.signals.WTF,
     e_teacher:     s.signals.TE,
     f_assign:      s.signals.A,
     base_score:    s.base_score,
     synergy_score: s.synergy_bonus,
     teacher_floor: s.teacher_floor_applied,
     final_score:   s.final_score,
     band:          s.band,
   }))

9. logger.info("[run-prediction] Completed", {
     subjectId: payload.subjectId,
     topicsScored: allScored.length,
     modulesProcessed: [...grouped.keys()].length,
   })

10. Return { success: true, predictionRunId, topicsScored: allScored.length }
```

---

#### [MODIFY] `trigger/index.ts`

Add:
```typescript
import "./tasks/run-prediction";
```

---

#### [NEW] `app/api/predictions/route.ts`

Follow the auth pattern from other routes in `app/api/` (use `createServerClient` from `@/lib/supabase-server`).

**POST handler:**
```typescript
// Body: { subjectId: string, examType?: string, examLabel?: string, moduleNos?: number[] }
// 1. Auth check → 401 if not logged in
// 2. Verify subject ownership: subjects WHERE id=subjectId AND user_id=user.id → 403 if not found
// 3. tasks.trigger("run-prediction", { subjectId, userId: user.id, examType, examLabel, moduleNos })
// 4. Return NextResponse.json({ runId: handle.id }, { status: 202 })
```

**GET handler:**
```typescript
// Query: ?subjectId=<uuid>
// 1. Auth check → 401
// 2. Fetch prediction_runs WHERE subject_id=subjectId AND user_id=user.id ORDER BY created_at DESC LIMIT 1
// 3. If none → return { run: null, scores: [] }
// 4. Fetch prediction_topic_scores WHERE prediction_run_id=run.id
//    Join topics table to get topic name: select("*, topics(name, module_id)")
// 5. Return { run: { id, exam_type, exam_label, created_at, modules_in_scope }, scores: [...] }
```

**Imports for route.ts:**
```typescript
import { tasks } from "@trigger.dev/sdk/v3";
import type { runPredictionTask } from "@/trigger/tasks/run-prediction";
// trigger with: tasks.trigger<typeof runPredictionTask>("run-prediction", payload)
```

### Done Criteria — Phase 2
- [ ] `lib/etsm/collect.ts` exists and compiles
- [ ] `lib/etsm/index.ts` now exports collect
- [ ] `trigger/tasks/run-prediction.ts` exists
- [ ] `trigger/index.ts` has the new import
- [ ] `app/api/predictions/route.ts` exists (POST + GET)
- [ ] `npm run build` passes with zero TypeScript errors

---

## Phase 3 — Subject Configuration UI

### Files to Create / Modify

#### [NEW] `app/api/subjects/[id]/config/route.ts`

**PATCH handler:**
```typescript
// Body: { college_assignment_factor?: number }
// 1. Auth check → 401
// 2. Verify ownership of subject (id = params.id)
// 3. supabase.from("subjects")
//      .update({ college_assignment_factor: body.college_assignment_factor })
//      .eq("id", params.id).eq("user_id", user.id)
// 4. Return 200 { success: true }
```

---

#### [MODIFY] `app/dev-test/page.tsx`

Three additions to the existing page. Codex must read the existing file structure before inserting.

---

**Addition A — Hint Confidence Picker**

Location: Inside the Teacher Hints card, **below the hint textarea**, above the Save button.

Component: A horizontal row of 3 clickable cards. State: `confidenceLevel: "EXACT" | "VAGUE" | "GUESS"`, default `"EXACT"`.

| Card | Label | Subtitle | Value |
|------|-------|----------|-------|
| 1 | "Teacher said it directly" | "High confidence — direct quote" | `EXACT` |
| 2 | "Think I heard it / Vague" | "Medium — mentioned but uncertain" | `VAGUE` |
| 3 | "My own guess / reading" | "Low — personal inference" | `GUESS` |

When the user saves hints, pass `confidence: confidenceLevel` in the request body to the existing hint-save API. Codex must find the existing hint-save call and add the `confidence` field.

**Also confirm:** locate the existing hint-save API route (`app/api/` somewhere). Verify it passes `confidence` to the `teacher_hints` upsert. If `confidence` is missing from the upsert, add it.

---

**Addition B — Assignment Factor Picker**

Location: A new card section, placed logically near other subject-level settings in the page. Title: **"Do assignments appear in your exam?"**

Component: A 2×2 grid of 4 clickable cards. State: `assignmentFactor: 0.0 | 0.3 | 0.6 | 1.0`. Initialized by fetching current `subjects.college_assignment_factor` value from the DB (already loaded as part of subject data — if not yet fetched, add it to the existing subjects fetch).

| Card | Label | Subtitle | Value |
|------|-------|----------|-------|
| 1 | "Yes, heavily tested" | "Assignments closely mirror exam questions" | `1.0` |
| 2 | "Sometimes overlap" | "Partial overlap — some topics appear" | `0.6` |
| 3 | "Rarely on exams" | "Assignments are mostly for practice" | `0.3` |
| 4 | "Never / Just for marks" | "Exams are completely independent" | `0.0` |

On card click: immediately PATCH `/api/subjects/${subjectId}/config` with `{ college_assignment_factor: value }`. Show a brief success/error indicator.

---

**Addition C — Generate Predictions + Results View**

Location: A new prominent section. Place it after the existing data sections.

**"Generate Predictions" button:**
- On click: POST to `/api/predictions` with `{ subjectId }`
- Show loading spinner during POST
- On 202 response: show toast "Prediction started — results will appear in a moment"
- After short delay (or on next page focus): refetch GET `/api/predictions?subjectId=...` to show results

**Results display:**
- Fetched via GET `/api/predictions?subjectId=...` on component mount
- Group scores by `module_id`, display each module as a card/section
- Within each module: list topics sorted by `final_score` descending
- Each topic row shows:
  - Topic name
  - Band badge: `HIGH` (green), `MEDIUM` (amber), `LOW` (grey)
  - Final score as percentage (e.g. `73%`)
- If no run exists: show "No predictions yet — click Generate to start"
- Show a "Re-run" / refresh button

---

### Done Criteria — Phase 3
- [ ] Hint confidence picker renders in the hints section
- [ ] Confidence value is passed to `teacher_hints.confidence` on save (confirm existing API or fix)
- [ ] Assignment factor picker renders and immediately PATCHes on change
- [ ] `/api/subjects/[id]/config` PATCH route exists and updates the DB
- [ ] Generate Predictions button triggers POST `/api/predictions`
- [ ] Results view renders grouped by module with HIGH/MEDIUM/LOW badges and percentages
- [ ] `npm run build` passes

---

## What Codex Must NEVER Touch (All Phases)

- `lib/sp/`, `lib/nc/`, `lib/wtf/`, `lib/te/`, `lib/a/` — all signal compute logic is frozen
- `trigger/tasks/compute-*.ts` — all signal compute tasks are frozen
- `lib/hints.ts` — frozen
- `lib/shared/exam-scope.ts` — frozen
- `lib/te/compute.ts` — already updated, do not modify further
- Any existing migration files in `supabase/migrations/`

---

## Edge Cases (All Phases)

1. **Empty data (no papers, hints, assignments):** SP + NC always active. If both 0 → all topics score 0 → all LOW. No crash.
2. **Tiny module (N=1):** `Math.ceil(1 × 0.30) = 1` → 1 HIGH topic guaranteed.
3. **Teacher floor conflict:** Floor (0.65) is applied before banding — a floor-triggered topic can never fail the `< 0.25` garbage guard.
4. **Vague hint + teacher floor:** `hint_confidence_scalar = 0.6` satisfies the `>= 0.6` check for the floor. Floor still triggers if `TE >= 0.75`.
5. **Missing signal:** Any topic with no row in a signal table → that signal defaults to `0.0`.
6. **`college_assignment_factor = 0.0`:** A-signal fully excluded from weight normalization — `has_assignments` is irrelevant.
7. **Null module_id on a topic:** Skip with a console warning. Should not happen in valid data.

---

## Verification Plan

### Phase 1
- `npm run build` — zero TypeScript errors

### Phase 2
- `npm run build` — zero TypeScript errors
- Manual: POST `/api/predictions` with a valid subjectId → confirm `prediction_runs` row inserted in Supabase
- Manual: Query `prediction_topic_scores` → confirm rows with valid `band` values

### Phase 3
- `npm run build` — zero TypeScript errors
- Manual: Save a hint with "Vague" selected → confirm `teacher_hints.confidence = 'VAGUE'` in DB
- Manual: Select "Sometimes overlap" → confirm `subjects.college_assignment_factor = 0.6` in DB
- Manual: Generate Predictions → confirm results render with HIGH/MEDIUM/LOW bands
