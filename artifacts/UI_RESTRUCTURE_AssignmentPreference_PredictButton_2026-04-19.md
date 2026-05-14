# UI Restructure: Assignment Preference + Predict Button

**File:** `app/dev-test/page.tsx`  
**Date:** 2026-04-19  
**Phases:** 2  

---

## Background

Two related UI issues in `app/dev-test/page.tsx`:

1. **Assignment preference panel** ("Do assignments appear in your exam?") always renders at the top of every subject card, even when no assignments have been uploaded. It should only appear contextually during the assignment upload flow.

2. **Generate Predictions** lives as a large standalone section inside every subject card. It should be demoted to a toolbar button alongside "Ask AI" and locked (disabled with a tooltip) until the minimum required data is present.

---

## Phase 1 — Relocate Assignment Preference Into Upload Warning Modal

### What Codex Must Build

The assignment preference UI (the 4-option grid: "Yes, heavily tested", "Sometimes overlap", etc.) must be **removed from the subject card's main body** and **inserted into the `questionsWarningOpen` modal** — but only when the upload type is `ASSIGNMENT`.

**Current flow:**
```
User clicks "Assignments" button
  → questionsWarningOpen modal opens (generic warning)
  → User clicks "Proceed"
  → uploadModalOpen opens (file picker)
```

**New flow:**
```
User clicks "Assignments" button
  → questionsWarningOpen modal opens (generic warning)
  → Below the warning text, the 4-option preference panel appears (ONLY for ASSIGNMENT type)
  → User selects a preference (required before Proceed is enabled)
  → User clicks "Proceed"
  → uploadModalOpen opens (file picker)
```

### Exact Changes

**a. `questionsWarningOpen` modal** (search for `questionsWarningOpen &&` in the JSX):
- Add a conditional block between the warning text and the Proceed button:
  ```
  {uploadResourceType === 'ASSIGNMENT' && <AssignmentPreferencePanel />}
  ```
- The Proceed button must be **disabled** if `uploadResourceType === 'ASSIGNMENT'` AND `assignmentPrefSelected === false`.
- Add local state: `const [assignmentPrefSelected, setAssignmentPrefSelected] = useState(false)`
- Reset `assignmentPrefSelected` to `false` inside `openUploadModal()`.

**b. Remove** the block at lines ~2258–2334 from the subject card body. This is the:
```jsx
<div className="mb-4 p-4 rounded-xl border bg-slate-900/70 border-slate-700">
  <h4 className="text-sm font-semibold text-slate-100 mb-2">
    Do assignments appear in your exam?
  ...
</div>
```

**c. `updateAssignmentFactor`** function — after a successful save, also call `setAssignmentPrefSelected(true)`.

### What Codex Must NOT Touch
- `updateAssignmentFactor` function logic itself
- `assignmentFactorSaving` / `assignmentFactorStatus` state
- The file picker modal (`uploadModalOpen`)
- Any other modal

### Done When
The assignment preference grid no longer appears in the static subject card body. It only appears inside `questionsWarningOpen` modal when `uploadResourceType === 'ASSIGNMENT'`. Proceed is gated until a preference is selected.

---

## Phase 2 — Demote Generate Predictions to a Locked Toolbar Button

### What Codex Must Build

**a. Remove** the entire "Generate Predictions" section from each subject card. This is the block at lines ~2336–2442:
```jsx
<div className="mb-4 p-4 rounded-xl border bg-gradient-to-br from-emerald-950/40 to-slate-900 border-emerald-700/40">
  <h4 className="text-base font-semibold text-emerald-300">Generate Predictions</h4>
  ...
</div>
```

**b. Add** a `🔮 Predict` button and a `🔄` refresh icon button to the Upload Documents toolbar, **after the existing "Ask AI" button**.

**Prerequisites lock logic** — compute per subject:
```js
const canGeneratePredictions =
  subject.hasSyllabus === true &&
  subject.hasExamScope === true &&
  ((subject.testPaperQuestions?.length ?? 0) > 0 ||
   (subject.assignmentQuestions?.length ?? 0) > 0)
```

**Predict button behaviour:**
- When `canGeneratePredictions === false`: disabled, `title="Upload syllabus, exam scope, and at least one test paper or assignment first"`
- When `canGeneratePredictions === true`: enabled, calls `generatePredictions(subject.id)` on click
- While generating (`predictionGenerating[subject.id]`): shows "Starting…" and is disabled

**Refresh button behaviour:**
- Same disabled/enabled rule as Predict
- Calls `fetchPredictions(subject.id)` on click
- While loading (`predictionLoading[subject.id]`): shows spinner / disabled

**Toolbar row after Phase 2:**
```
[ Syllabus ] [ Add Exam Scope ] [ Test Papers ] [ Assignments ] [ Hints + Pattern ] [ Upload Notes ] [ Ask AI ] [ 🔮 Predict ] [ 🔄 ]
```

**c. Prediction scores table** — relocate below the Upload Documents toolbar div (`</div>` that closes the `pt-4 border-t border-slate-700` div). Keep the exact same JSX (grouped by module, band chips, score percentages). Render only when `predictionRuns[subject.id]` exists.

### What Codex Must NOT Touch
- `generatePredictions()` function
- `fetchPredictions()` function
- `predictionRuns`, `predictionScores`, `predictionLoading`, `predictionGenerating` state
- Any API routes

### Done When
- The large "Generate Predictions" section is gone from every subject card
- `🔮 Predict` button is locked until `canGeneratePredictions === true`
- Prediction scores still render correctly (now below toolbar)
- `🔄` refresh works the same as the old Refresh button

---

## New State Required (Phase 1 only)

```ts
const [assignmentPrefSelected, setAssignmentPrefSelected] = useState(false)
```

Declare alongside other `useState` declarations at the top of the component.

---

## File Touched

**Only one file across both phases:**

`app/dev-test/page.tsx`

No API changes. No DB changes. No new files.

---

## Verification Plan

### Phase 1
- Open any subject card → "Do assignments appear in your exam?" panel should NOT be visible in the card body
- Click Assignments button → `questionsWarningOpen` modal opens → 4-option grid appears inside the modal below warning text
- Proceed button is **disabled** until an option is clicked
- Select an option → Proceed enabled → file picker opens
- Click Test Papers → warning modal opens **without** the preference panel; Proceed is immediately enabled

### Phase 2
- Subject with only syllabus → 🔮 Predict button visible but locked (greyed out, tooltip visible)
- Subject with syllabus + exam scope + at least one test paper → Predict button enabled
- Click Predict → `generatePredictions` fires → button shows "Starting…"
- Prediction scores table still renders below the toolbar row after predictions exist
- 🔄 refresh button calls `fetchPredictions` correctly
