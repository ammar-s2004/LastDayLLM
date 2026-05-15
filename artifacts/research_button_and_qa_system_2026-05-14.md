# Research Button + Q/A System — Full Technical Plan
**Authored by:** Opus-4.6 (Architect Role)  
**Date:** 2026-05-14  
**For:** Codex execution  
**Pipeline:** Ammar's Workflow — Phase-based

---

## SYSTEM CONTEXT (Read Before Touching Anything)

- **App:** Next.js (App Router), TypeScript, Tailwind CSS
- **Auth:** Supabase (RLS-enabled)
- **Background jobs:** Trigger.dev v4 (`@trigger.dev/sdk`)
- **Vector store:** Qdrant (for RAG notes queries)
- **Primary dev page:** `app/dev-test/page.tsx` — 4157 lines, single-file client component. Treat it with care.
- **Prediction pipeline already exists and works:**
  - `generatePredictions(subjectId)` → POST `/api/predictions` → triggers `run-prediction` Trigger.dev task
  - Task runs `collectSignals()` → `ETSMFusionEngine.rankModule()` → saves to `prediction_topic_scores` + `prediction_runs`
  - `fetchPredictions(subjectId)` → GET `/api/predictions?subjectId=X` → loads scores
- **Topic ranking already works.** Nothing in the backend needs to change for Phase 1.

---

## PHASE 1 — UI: Replace Buttons with "Start the Research" CTA

### Objective
Remove three buttons from every subject card:
1. `🤖 Ask AI` button (lines ~2911–2925)
2. `🔮 Predict` button (lines ~2927–2938)
3. `🔄` (refresh) button (lines ~2940–2953)

Replace with a single full-width **"🚀 Start the Research"** button pinned at the bottom of the subject card's action section. This button calls the same `generatePredictions(subject.id)` function as the old Predict button.

### File
`app/dev-test/page.tsx`

### Exact Lines to Remove
Find and remove the following three consecutive button blocks (all inside the `<div className="flex flex-wrap gap-2">` button cluster that starts around line 2764):

**Block 1 — Ask AI button (~lines 2911–2925):**
```
{/* 🤖 ASK AI */}
<button
  onClick={() => setAskAiSubjectId(askAiSubjectId === subject.id ? null : subject.id)}
  disabled={!uploadedNotes[subject.id]?.length}
  title={...}
  className={`px-4 py-2 border rounded-lg ... Ask AI button classes`}
>
  🤖 Ask AI
</button>
```

**Block 2 — Predict button (~lines 2927–2938):**
```
<button
  onClick={() => generatePredictions(subject.id)}
  disabled={!canGeneratePredictions || predictionGenerating[subject.id]}
  title={...}
  className={`px-4 py-2 border rounded-lg ... Predict button classes`}
>
  {predictionGenerating[subject.id] ? 'Starting...' : '🔮 Predict'}
</button>
```

**Block 3 — Refresh button (~lines 2940–2953):**
```
<button
  onClick={() => fetchPredictions(subject.id)}
  disabled={!canGeneratePredictions || predictionLoading[subject.id]}
  title={...}
  className={`px-3 py-2 border rounded-lg ... refresh button classes`}
>
  {predictionLoading[subject.id] ? <spinner /> : '🔄'}
</button>
```

Also remove the hidden div block around the duplicate predictions UI (~lines 2467–2589, wrapped in `<div className="hidden">`). This is dead code.

### What to Add

**Immediately after the closing `</div>` of the `flex flex-wrap gap-2` button cluster** (after the Upload Buttons section ends, around line 2954), add a new section:

---

#### "Start the Research" Button Section

This is a **separate `<div>` block** placed below the Upload Buttons section, still inside the subject card `<div key={subject.id}>`.

Structure of what to render:

**When `!canGeneratePredictions`:** Show the button in a disabled/locked state, and below it render a small checklist of what's missing. The checklist reads each prereq and marks it ✅ or ❌:
- ✅/❌ Syllabus uploaded
- ✅/❌ Exam scope configured
- ✅/❌ Test papers / assignments uploaded (or PYQs skipped)

**When `canGeneratePredictions`:** Show the button fully active with a gradient and subtle glow animation.

**When `predictionGenerating[subject.id]`:** Show loading state with spinner inside the button, text says "Running Research Engine..."

**When `predictionRuns[subject.id]` exists:** Change button label to "🔄 Re-run Research" (still calls `generatePredictions`). Show a small "Last run: [date]" tag above the button.

#### Button Specifications

- **Full width** (`w-full`)
- **Tall** (`py-4`)
- **Text:** `text-lg font-bold`
- **Active gradient:** `bg-gradient-to-r from-indigo-600 via-sky-600 to-emerald-600`
- **Active hover:** slightly brighter, `hover:from-indigo-500 hover:via-sky-500 hover:to-emerald-500`
- **Active shadow:** `shadow-lg shadow-sky-900/40`
- **Transition:** `transition-all duration-300`
- **Disabled state:** `opacity-50 cursor-not-allowed bg-slate-800 border border-slate-600 text-slate-500` — no gradient
- **Rounded:** `rounded-xl`
- **onClick:** `() => generatePredictions(subject.id)`
- **disabled:** `!canGeneratePredictions || predictionGenerating[subject.id]`

#### Prereq Checklist (shown only when `!canGeneratePredictions`)

Render directly below the button as a compact horizontal or vertical list of small badge-style items. Each item:
- Icon: ✅ (green text) or ❌ (red text)
- Label: plain text, `text-xs text-slate-400`

Conditions:
```
Syllabus       ✅ if subject.hasSyllabus === true,      else ❌
Exam Scope     ✅ if subject.hasExamScope === true,     else ❌
Papers / Skip  ✅ if testPaperQuestions.length > 0 
                  OR assignmentQuestions.length > 0 
                  OR pyqsSkipped,                       else ❌
```

#### Existing Prediction Results Display

**Do not remove the block at lines ~2957–3030** (`{predictionRuns[subject.id] && (<div className="mt-4 space-y-4">...)`). This is the scores display (topic bands per module). It stays exactly as-is — just the buttons above it are being replaced.

---

### Also Remove: Inline Refresh Trigger After Research

In `generatePredictions()` function body (~line 829):
```js
setTimeout(() => {
  fetchPredictions(subjectId)
}, 2000)
```
This is a blind 2-second timer. Replace with a 3-second delay (give the Trigger.dev job more time to start):
```
setTimeout(() => {
  fetchPredictions(subjectId)
}, 3000)
```
This is a minor tweak, not a new feature.

---

### State to Preserve
Do NOT remove or change these state variables — they are still used:
- `predictionRuns`, `predictionScores`, `predictionLoading`, `predictionGenerating`, `spTruncated`, `skipPyqConfirm`
- `askAiSubjectId`, `chatMessages`, `chatInput`, `isChatLoading` — keep the state declarations even though the UI toggle is gone (the underlying functions may be used in Phase 3)

---

### Done Criteria for Phase 1
- `🤖 Ask AI`, `🔮 Predict`, `🔄` buttons are gone from every subject card
- `🚀 Start the Research` button appears at the bottom of each subject card
- Button is disabled with checklist when prereqs are missing
- Button is active (gradient) when prereqs are met
- Clicking the button triggers `generatePredictions(subject.id)` 
- Loading spinner appears inside button while generating
- Toast appears as before
- Prediction scores still render below the button after completion
- No TypeScript errors, no broken imports

---

## PHASE 2 — Verify Fusion → DB (Smoke Test Only)

> **No code changes needed. This is a verification phase only.**

After Phase 1 ships, Ammar clicks "Start the Research" on a subject that has:
- Syllabus (✅)
- Exam scope (✅)
- At least one test paper or PYQs skipped (✅)

Expected DB outcome after ~15–30 seconds:
- New row in `prediction_runs` (subject_id, user_id, created_at, modules_in_scope)
- Multiple rows in `prediction_topic_scores` (one per topic in scope, with final_score, band, p_prior, e_notes, f_tests, e_teacher, f_assign)

If this works: Phase 2 is confirmed complete. Move to Phase 3.

---

## PHASE 3 — Q/A Database Schema

### Objective
Create the `generated_questions` table in Supabase. This is a pure database migration.

### Migration File
Create via Supabase MCP (`apply_migration`), name: `add_generated_questions_table`

### Schema

Table: `generated_questions`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `subject_id` | `uuid` | FK → `subjects(id)` ON DELETE CASCADE, NOT NULL |
| `prediction_run_id` | `uuid` | FK → `prediction_runs(id)` ON DELETE CASCADE, NOT NULL |
| `topic_id` | `uuid` | FK → `topics(id)` ON DELETE CASCADE, NOT NULL |
| `module_id` | `uuid` | FK → `modules(id)` ON DELETE CASCADE, NOT NULL |
| `question_text` | `text` | NOT NULL |
| `answer_text` | `text` | NOT NULL |
| `difficulty` | `text` | CHECK IN ('EASY', 'MEDIUM', 'HARD'), NOT NULL |
| `question_type` | `text` | CHECK IN ('SHORT', 'LONG', 'NUMERICAL', 'DEFINITION'), NOT NULL |
| `band` | `text` | CHECK IN ('HIGH', 'MEDIUM', 'LOW'), NOT NULL |
| `created_at` | `timestamptz` | default `now()` |

RLS: Enable. Policy: Users can SELECT their own subject's questions (join through subjects → user_id = auth.uid()). Service role can INSERT.

Index: `(subject_id, prediction_run_id)` for fast per-run lookups.

---

## PHASE 4 — Q/A Generation Trigger Task

### File
`trigger/tasks/generate-questions.ts`  
Export name: `generateQuestionsTask`  
Trigger ID: `"generate-questions"`

### Payload Interface
```
{
  subjectId: string
  predictionRunId: string
  userId: string
}
```

### Logic
1. Query `prediction_topic_scores` WHERE `prediction_run_id = payload.predictionRunId` AND `band IN ('HIGH', 'MEDIUM')` — join with `topics` to get topic name, `modules` to get module_id and module_no
2. For each topic (max 20 total to avoid excessive AI cost — take top 20 by `final_score`):
   a. Query Qdrant notes for that topic: use existing RAG retrieval (`lib/qdrant/`) with `subject_id` and topic name as query
   b. If notes context found: build prompt with topic name + module context + notes excerpts
   c. If no notes: build prompt with topic name + module context only (syllabus-only fallback)
   d. Call Claude (use existing AI client from `lib/`) to generate questions
   e. Parse response: extract 2–4 questions per topic, each with `question_text`, `answer_text`, `difficulty`, `question_type`
3. Batch insert all rows into `generated_questions`
4. Return `{ success: true, questionsGenerated: N }`

### Prompt Structure (describe, do not hardcode)
The prompt must instruct the model to return a JSON array. Each element has: `question`, `answer`, `difficulty` (EASY/MEDIUM/HARD), `type` (SHORT/LONG/NUMERICAL/DEFINITION). Parse with `JSON.parse()`, wrap in try/catch. On parse failure, log and skip that topic.

### Error Handling
- Wrap each per-topic iteration in try/catch — a failure on one topic must not abort all others
- Retry config: `maxAttempts: 3, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 10000`

### Integration Point
After `run-prediction` task completes successfully, the API route (`/api/predictions`) should trigger `generateQuestionsTask` with the new `predictionRunId`. Do this as a fire-and-forget (no `triggerAndWait`).

---

## PHASE 5 — Q/A UI Panel

### File
`app/dev-test/page.tsx`

### New State Variables to Add
```
const [qaSubjectId, setQaSubjectId] = useState<string | null>(null)
const [generatedQuestions, setGeneratedQuestions] = useState<Record<string, GeneratedQuestion[]>>({})
const [qaLoading, setQaLoading] = useState<Record<string, boolean>>({})
```

### New Interface
```
interface GeneratedQuestion {
  id: string
  topic_id: string
  module_id: string
  question_text: string
  answer_text: string
  difficulty: 'EASY' | 'MEDIUM' | 'HARD'
  question_type: 'SHORT' | 'LONG' | 'NUMERICAL' | 'DEFINITION'
  band: 'HIGH' | 'MEDIUM' | 'LOW'
}
```

### New API Route
`app/api/questions-generated/route.ts`
- GET: `/api/questions-generated?subject_id=X&prediction_run_id=Y` → returns array of questions for that run
- Uses Supabase server client with auth check

### UI Placement
Below the prediction scores section (after `{predictionRuns[subject.id] && (...)}`), render a new collapsible panel:

**Toggle button:** `📖 View Q/A` or `📖 Hide Q/A` — small, right-aligned below the scores

**Panel content when expanded:**
- Group questions by module (same grouping pattern as the scores display)
- Within each module, list questions sorted by band (HIGH first) then difficulty
- Each question card:
  - Shows `question_text` prominently
  - Shows band badge + difficulty badge
  - Shows question_type label
  - Has expandable `answer_text` section (click to reveal, chevron icon)
- Empty state: "No Q/A generated yet — run Research to generate questions"

### Done Criteria for Phase 5
- Q/A panel appears below prediction scores when predictions exist
- Questions grouped by module, sorted by band
- Answers are collapsible
- Loading state while fetching
- Empty state message when no questions

---

## CONSTRAINTS FOR CODEX (Apply to All Phases)

1. **Do not reorganize or refactor `page.tsx`** beyond the described changes. The file is 4157 lines and intentionally monolithic. Do not split it.
2. **Do not change any existing API routes** unless explicitly listed in a phase.
3. **Do not rename or change the signature of `generatePredictions()` or `fetchPredictions()`.**
4. **All state variables must remain declared** even if their UI toggles are removed — downstream phases may use them.
5. **TypeScript strict mode** — no `any` where a type is knowable. No suppressing errors with `// @ts-ignore`.
6. **Trigger.dev tasks** — use `task()` from `@trigger.dev/sdk`, not `client.defineJob()`. Export all tasks from `trigger/tasks/` and register in `trigger/index.ts`.
7. **Supabase client in tasks** — always use `createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY)` — service key, not anon key. Admin access only in background tasks.
8. **AI calls** — follow existing patterns in `lib/ai-prompts.ts` and `lib/ai-limits.ts`. Do not introduce new model identifiers not already in use.

---

## EXECUTION ORDER

```
Phase 1 → Ammar reviews UI → Phase 2 (verify DB) → Phase 3 (DB schema) → Phase 4 (Trigger task) → Phase 5 (Q/A UI)
```

Ammar controls pace. Codex executes one phase at a time. Each phase waits for Sonnet review before the next begins.
