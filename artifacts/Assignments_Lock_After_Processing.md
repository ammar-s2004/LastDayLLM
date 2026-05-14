# Assignment Lock After Processing — Technical Plan for Codex
**Date:** 2026-05-02  
**File:** `app/dev-test/page.tsx`  
**Scope:** UI-only change. No API, no DB schema, no backend changes.

---

## Context

Three other items already implement the "locked after processed" pattern. Study them before touching anything:

| Item | Lock condition | Button appearance when locked |
|---|---|---|
| Syllabus | `allTopics.length > 0 \|\| subject.hasSyllabus` | `🔒 Syllabus Locked` — green `bg-green-900/30 border-green-700 text-green-400 cursor-not-allowed` |
| Exam Scope | `subject.hasExamScope` | `🔒 ${subject.examScopeType}` — purple `bg-purple-900/30 border-purple-700 text-purple-400 cursor-not-allowed` |
| PYQs skipped | `pyqsSkipped` | `🔒 PYQs Skipped` — slate disabled |

The Assignment button lives at **lines 2704–2715** and currently has zero lock logic — it is only disabled when `!subject.hasExamScope`.

The Assignment "processed" signal already exists in the data: `subject.assignmentQuestions` is populated in `loadSubjects()` via a questions query filtered to `resource_type === 'ASSIGNMENT'`. If `assignmentQuestions.length > 0`, the assignment has been processed.

---

## Phase 1 — Only Phase

### What Codex must build

**Step 1 — Derive the lock boolean inside the `subjects.map()` block**

At approximately line 2018, inside the `subjects.map((subject) => {` callback, after the existing `pyqsSkipped` and `canGeneratePredictions` derivations, add:

```ts
const hasProcessedAssignment = (subject.assignmentQuestions?.length ?? 0) > 0
```

This is the single source of truth. Do NOT derive it inline in JSX.

---

**Step 2 — Replace the Assignments upload button (lines 2704–2715)**

Current code (lines 2704–2715):
```tsx
{/* ✅ ASSIGNMENTS */}
<button
  onClick={() => openUploadModal(subject.id, 'ASSIGNMENT')}
  disabled={!subject.hasExamScope}
  title={!subject.hasExamScope ? "Configure exam scope first" : undefined}
  className={`px-4 py-2 border rounded-lg transition text-sm ${!subject.hasExamScope
    ? 'bg-slate-800 border-slate-600 text-slate-500 cursor-not-allowed opacity-60'
    : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'
    }`}
>
  📋 Assignments
</button>
```

Replace with:
```tsx
{/* ✅ ASSIGNMENTS */}
<button
  onClick={() => !hasProcessedAssignment && openUploadModal(subject.id, 'ASSIGNMENT')}
  disabled={!subject.hasExamScope || hasProcessedAssignment}
  title={
    hasProcessedAssignment
      ? "Assignment already processed — cannot be changed"
      : !subject.hasExamScope
        ? "Configure exam scope first"
        : undefined
  }
  className={`px-4 py-2 border rounded-lg transition text-sm ${
    hasProcessedAssignment
      ? 'bg-teal-900/30 border-teal-700 text-teal-400 cursor-not-allowed'
      : !subject.hasExamScope
        ? 'bg-slate-800 border-slate-600 text-slate-500 cursor-not-allowed opacity-60'
        : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'
  }`}
>
  {hasProcessedAssignment ? '🔒 Assignment Locked' : '📋 Assignments'}
</button>
```

Color theme to use: **teal** (`teal-900/30`, `teal-700`, `teal-400`) — matches the existing Assignment Questions preview card which already uses teal (`bg-teal-900/20 border-teal-700/50` at line 2263). This creates visual consistency: the preview card is teal, the locked button is teal.

---

**Step 3 — Add the inline locked warning panel**

After the Assignment Questions preview section (which ends around line 2284), add a new locked-state warning panel. This panel is only shown when `hasProcessedAssignment === true`. It appears in the subject card body, not in a modal.

Insert immediately after line 2284 (after the closing `</div>` of the Assignment Questions preview block):

```tsx
{/* ✅ ASSIGNMENT LOCKED NOTICE */}
{hasProcessedAssignment && (
  <div className="mb-4 p-3 rounded-lg border bg-teal-900/10 border-teal-800/40 flex items-start gap-3">
    <span className="text-teal-400 text-lg shrink-0 mt-0.5">🔒</span>
    <div>
      <p className="text-xs font-semibold text-teal-300 mb-0.5">
        Assignment Locked
      </p>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        Assignment has been processed and is now locked. It cannot be changed or re-uploaded in this version.
      </p>
    </div>
  </div>
)}
```

---

### Where the files live

Single file: `app/dev-test/page.tsx`

### Inputs

- `subject.assignmentQuestions` — already populated by `loadSubjects()`. No new fetch needed.

### Outputs

- `hasProcessedAssignment: boolean` — local computed const in the map callback
- Modified Assignment button — visually locked when true
- New locked warning panel — shown inside subject card when true

### What Codex must NOT touch

- `loadSubjects()` — no changes needed, data is already there
- `openUploadModal()` — no changes needed
- Any API route
- Any DB schema
- The assignment questions preview card (lines 2261–2284) — leave it exactly as is
- The questions warning modal (`questionsWarningOpen`) — leave it as is
- Any other button or upload flow

### Done means

1. When `assignmentQuestions.length > 0` for a subject:
   - Assignment button shows `🔒 Assignment Locked` in teal, disabled, cursor-not-allowed
   - Hovering the button shows tooltip: "Assignment already processed — cannot be changed"
   - A teal lock notice panel appears below the assignment questions preview in the subject card
2. When `assignmentQuestions.length === 0` and exam scope exists — button behaves exactly as before
3. When exam scope does not exist — button behaves exactly as before (slate disabled)
4. No console errors, no TypeScript errors
5. No regressions on any other button's behavior

---

## Verification

Codex should verify by reading the final diff for these three things only:
1. `const hasProcessedAssignment` is declared once per subject map iteration
2. The Assignment button's `className`, `disabled`, `title`, and inner text correctly branch on `hasProcessedAssignment`
3. The locked warning `<div>` appears in JSX after the assignment questions preview block
