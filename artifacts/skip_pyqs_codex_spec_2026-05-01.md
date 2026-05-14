# Skip PYQs — Codex Execution Spec
**Date**: 2025-05-01
**Feature**: Allow students to skip PYQ uploads and still run predictions

---

## Phase 1: Backend Config Flag (Trivial)

### File: `app/api/subjects/route.ts` — PATCH handler

The existing PATCH handler already merges `config` into the subject's JSONB column. The new key `pyqs_skipped: boolean` will be stored there via the existing `saveSubjectConfig()` call from the frontend. **No backend code changes needed.**

---

## Phase 2: Frontend UI Changes

### File: `app/dev-test/page.tsx`

**All changes are in this single file.**

---

### 2A. Update `canGeneratePredictions` (around line 2017)

**FIND** (exact match):
```ts
const canGeneratePredictions =
  subject.hasSyllabus === true &&
  subject.hasExamScope === true &&
  ((subject.testPaperQuestions?.length ?? 0) > 0 ||
    (subject.assignmentQuestions?.length ?? 0) > 0)
```

**REPLACE WITH:**
```ts
const pyqsSkipped = subject.config?.pyqs_skipped === true
const canGeneratePredictions =
  subject.hasSyllabus === true &&
  subject.hasExamScope === true &&
  ((subject.testPaperQuestions?.length ?? 0) > 0 ||
    (subject.assignmentQuestions?.length ?? 0) > 0 ||
    pyqsSkipped)
```

---

### 2B. Lock Test Papers button when skipped (around line 2679-2690)

**FIND** the Test Papers button:
```tsx
{/* ✅ TEST PAPERS */}
<button
  onClick={() => openUploadModal(subject.id, 'TEST_PAPER')}
  disabled={!subject.hasExamScope}
  title={!subject.hasExamScope ? "Configure exam scope first" : undefined}
  className={`px-4 py-2 border rounded-lg transition text-sm ${!subject.hasExamScope
    ? 'bg-slate-800 border-slate-600 text-slate-500 cursor-not-allowed opacity-60'
    : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'
    }`}
>
  📊 Test Papers
</button>
```

**REPLACE WITH:**
```tsx
{/* ✅ TEST PAPERS */}
<button
  onClick={() => openUploadModal(subject.id, 'TEST_PAPER')}
  disabled={!subject.hasExamScope || pyqsSkipped}
  title={!subject.hasExamScope ? "Configure exam scope first" : pyqsSkipped ? "PYQs skipped — unlock by uploading test papers" : undefined}
  className={`px-4 py-2 border rounded-lg transition text-sm ${pyqsSkipped
    ? 'bg-slate-700/30 border-slate-600 text-slate-500 cursor-not-allowed'
    : !subject.hasExamScope
      ? 'bg-slate-800 border-slate-600 text-slate-500 cursor-not-allowed opacity-60'
      : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'
    }`}
>
  {pyqsSkipped ? '🔒 PYQs Skipped' : '📊 Test Papers'}
</button>
```

---

### 2C. Add Skip PYQs card (insert AFTER the Assignments button, BEFORE the Teacher Hints button — around line 2703)

**INSERT** the following block between the Assignments button `</button>` and the `{/* ✅ TEACHER HINTS */}` comment:

```tsx
{/* ✅ SKIP PYQs CARD */}
{subject.hasExamScope && !pyqsSkipped && (subject.testPaperQuestions?.length ?? 0) === 0 && (
  <div className="w-full mt-3 p-4 bg-slate-800/50 border border-slate-700 rounded-xl">
    <div className="flex items-start gap-3">
      <span className="text-2xl shrink-0">📭</span>
      <div className="flex-1">
        <h4 className="text-sm font-semibold text-slate-200 mb-1">
          Don't have past papers?
        </h4>
        <p className="text-xs text-slate-400 mb-3 leading-relaxed">
          No worries! Predictions still work using syllabus analysis, notes, and teacher hints.
          Accuracy improves with PYQs, but they're not required.
        </p>
        <button
          onClick={async () => {
            await saveSubjectConfig(subject.id, { pyqs_skipped: true })
          }}
          className="px-4 py-2 bg-sky-500/20 border border-sky-500/40 text-sky-300 hover:bg-sky-500/30 rounded-lg text-sm font-medium transition-colors"
        >
          Skip — Predict Without PYQs
        </button>
      </div>
    </div>
  </div>
)}
```

---

### 2D. Add info banner in prediction results when skipped

**FIND** the spTruncated banner (around line 2406-2411):
```tsx
{spTruncated[subject.id] && (
  <div className="flex items-start gap-3 px-4 py-3 bg-amber-900/20 border border-amber-600/40 rounded-lg text-xs text-amber-300">
    <span className="text-base shrink-0">⚠️</span>
    <p><span className="font-semibold">Partial SP signal:</span> The AI response was cut short during scoring — some topic centrality scores may be missing. Predictions are still valid but may be less accurate. Re-run to attempt a full score.</p>
  </div>
)}
```

**INSERT AFTER** that block (after the closing `})`):
```tsx
{pyqsSkipped && (
  <div className="flex items-start gap-3 px-4 py-3 bg-sky-900/20 border border-sky-700/40 rounded-lg text-xs text-sky-300">
    <span className="text-base shrink-0">ℹ️</span>
    <p><span className="font-semibold">No PYQs:</span> Predictions are based on syllabus centrality, notes coverage, and teacher hints only. Upload past papers anytime to improve accuracy.</p>
  </div>
)}
```

**IMPORTANT**: The `pyqsSkipped` variable is scoped inside the `.map()` callback where `subject` is available (around line 2012). The second prediction results block (line 2787+) also needs this banner. There are **two** prediction display blocks — one hidden and one visible. Add the banner to BOTH, or at minimum to the visible one (the one around line 2787+).

---

## Phase 3: No separate phase needed

Phase 2C already handles the persist call via `saveSubjectConfig()` which calls `PATCH /api/subjects`. The local state update also happens in that function (line 586–598).

---

## DO NOT TOUCH

- `lib/etsm/engine.ts` — engine already handles `has_papers: false`
- `lib/etsm/collect.ts` — correctly sets `has_papers` from actual resources
- `lib/wtf/compute.ts` — irrelevant when no papers exist
- `trigger/tasks/compute-wtf.ts` — won't have data, produces zeros, fine
- `trigger/tasks/run-prediction.ts` — no changes needed
- Database schema — no migrations

---

## Testing Checklist

- [ ] Visit subject with syllabus + scope + no test papers → skip card visible
- [ ] Click "Skip" → card disappears, Test Papers shows "🔒 PYQs Skipped"
- [ ] Predict button unlocks → click it → predictions load
- [ ] Info banner "No PYQs" appears in results
- [ ] Reload page → skip state persists (stored in config JSONB)
