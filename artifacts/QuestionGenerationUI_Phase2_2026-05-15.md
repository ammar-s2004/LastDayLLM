# CODEX PLAN — Question Generation Module: Phase 2 UI Scaffold
**Date:** 2026-05-15  
**Phase:** 2 of 5  
**Scope:** Frontend only. No new API routes. No new Trigger.dev tasks. No question generation backend.

---

## CONTEXT

The project is NextJS (App Router), Supabase, TypeScript, Tailwind (via className), `framer-motion` (`motion/react`), and vanilla inline CSS where needed.

Design system reference: `app/page.tsx` (homepage). Follow it exactly:
- Background: `#000000`
- Primary accent: `#7C3AED`
- Secondary accent glow: `rgba(124,58,237,0.x)`
- Font family: `Inter, sans-serif` (body), `Playfair Display, serif` (large headings), `monospace` (badges/labels)
- Dark glassmorphism panels: `background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); backdrop-filter: blur(12px);`
- Grid background pattern (used in Agent Demo section): `backgroundImage: "linear-gradient(rgba(124,58,237,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.07) 1px, transparent 1px)", backgroundSize: "40px 40px"`
- Animations: use `framer-motion`. `initial={{ opacity: 0, y: 24 }}`, `animate={{ opacity: 1, y: 0 }}`, staggered children.
- Buttons: purple `#7C3AED`, hover `#8B5CF6`, glow `box-shadow: 0 0 28px rgba(124,58,237,0.55)`

Existing types to reuse (defined in `app/dev-test/page.tsx`):
- `PredictionRun`, `PredictionScore`, `Subject`

---

## WHAT CHANGES IN `app/dev-test/page.tsx`

### Change 1 — After `generatePredictions()` resolves, redirect to the questions page

`generatePredictions` is at line 807. After the `setTimeout(() => { fetchPredictions(subjectId) }, 3000)` block resolves, add a `router.push(\`/questions/${subjectId}\`)` call.

**Exact change:** Inside `generatePredictions` (line 807–840), after setting the success toast and the `setTimeout` for `fetchPredictions`, add:

```typescript
// Redirect to the Questions page after brief delay
setTimeout(() => {
  router.push(`/questions/${subjectId}`)
}, 1500)
```

The 1500ms delay lets the toast show before navigation. The `fetchPredictions` timeout can stay — it will pre-populate Supabase cache.

### Change 2 — Remove the inline prediction scores display

The inline prediction results block starts at line 2843 (`{predictionRuns[subject.id] && (`) and ends at approximately line 2926 (`)}` closing the outer conditional). 

**Remove this entire block.** The prediction scores will now only be shown on the new `/questions/[subjectId]` page.

The "Start the Research" button (line 2793–2813) stays as-is. Only remove the results table below it.

---

## NEW FILES TO CREATE

### File 1 — `app/questions/[subjectId]/page.tsx`
**Route:** `/questions/[subjectId]`  
**Purpose:** Module grid page. Shows study mode switcher at top + stacked rectangular module cards.

#### Layout structure:
```
[Full-page dark background: #000000 with purple grid pattern]
  ├── Fixed navbar (← Back | Subject Name | User Avatar placeholder)
  ├── Hero strip (subject name, exam type badge)
  ├── Study Mode Switcher (3-hour | 8-hour | 2-day toggle)
  └── Module Grid (stacked vertical cards, full width)
       ├── Module 1: [Title] ——————————————————— [arrow →]
       ├── Module 2: [Title] ——————————————————— [arrow →]
       ├── Module 3: [Title] ——————————————————— [arrow →]
       └── Module N: [Title] ——————————————————— [arrow →]
```

#### Data fetching:
This page uses `use client` and fetches data from Supabase client-side on mount.

Fetch these in `useEffect` on mount using `createClient()` from `@/lib/supabase-browser`:

1. **Subject info**: `supabase.from('subjects').select('id, name').eq('id', subjectId).single()`
2. **Modules**: `supabase.from('modules').select('id, module_no, title').eq('subject_id', subjectId).order('module_no', { ascending: true })`
3. **Latest prediction run**: `supabase.from('prediction_runs').select('id, exam_type, exam_label, created_at').eq('subject_id', subjectId).order('created_at', { ascending: false }).limit(1).maybeSingle()`

Store in state:
```typescript
const [subject, setSubject] = useState<{ id: string; name: string } | null>(null)
const [modules, setModules] = useState<Array<{ id: string; module_no: number; title: string }>>([])
const [predictionRun, setPredictionRun] = useState<{ id: string; exam_type?: string; exam_label?: string; created_at: string } | null>(null)
const [studyMode, setStudyMode] = useState<'3h' | '8h' | '2day'>('2day')
const [loading, setLoading] = useState(true)
```

#### Study Mode Switcher component (inline, not extracted):
Three-button pill toggle. Active state: `background: #7C3AED; color: white`. Inactive: `background: transparent; color: rgba(255,255,255,0.5); border: 1px solid rgba(255,255,255,0.1)`.

```
[  ⏰ 3 Hours  ]  [  ⏱ 8 Hours  ]  [  📅 2 Days  ]
```

Switching mode only updates `studyMode` state locally. Does NOT trigger any refetch. The actual filtering happens on the module detail page.

#### Module cards:
Each module card is a clickable `<button>` that calls `router.push(\`/questions/${subjectId}/${module.id}?mode=${studyMode}\`)`.

Card styling:
```
background: rgba(255,255,255,0.03)
border: 1px solid rgba(255,255,255,0.08)
border-radius: 16px
padding: 24px 32px
width: 100%
display: flex
align-items: center
justify-content: space-between
cursor: pointer
transition: all 0.2s
```

Hover state (via `onMouseEnter`/`onMouseLeave`):
```
border-color: rgba(124,58,237,0.5)
background: rgba(124,58,237,0.06)
box-shadow: 0 0 24px rgba(124,58,237,0.12)
```

Left side: `Module {module_no}` in small purple monospace label + title in white Inter bold 18px.  
Right side: `→` arrow in `#7C3AED`.

Animate cards in with `framer-motion` stagger:
```typescript
<motion.div
  key={module.id}
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: index * 0.08, duration: 0.4, ease: 'easeOut' }}
>
```

#### Loading state:
While `loading === true`, show 4 skeleton cards with a purple shimmer pulse animation.

Skeleton card:
```
background: rgba(255,255,255,0.03)
border: 1px solid rgba(255,255,255,0.06)
border-radius: 16px
height: 80px
width: 100%
animation: pulse 1.5s ease-in-out infinite
```

Add keyframe in a `<style>` tag at the bottom of the component:
```css
@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}
```

#### Empty state:
If `modules.length === 0` and `loading === false`, show:
```
[Purple Zap Icon]
No modules found
Upload a syllabus to get started
[← Back to Dashboard button]
```

#### Navigation:
- Back button top-left: `router.push('/dev-test')` 
- Subject name shown in navbar center
- Exam type badge (from `predictionRun.exam_type`) in a small pill: `background: rgba(124,58,237,0.15); border: 1px solid rgba(124,58,237,0.3); color: #A78BFA`

---

### File 2 — `app/questions/[subjectId]/[moduleId]/page.tsx`
**Route:** `/questions/[subjectId]/[moduleId]?mode=2day` (mode comes from query param)  
**Purpose:** Individual module questions table with study mode header and play buttons.

#### URL params:
- `subjectId` — from `params`
- `moduleId` — from `params`
- `mode` — from `searchParams` (`'3h' | '8h' | '2day'`, default `'2day'`)

#### Data fetching:
Fetch on mount using Supabase client:

1. **Module info**: `supabase.from('modules').select('id, module_no, title, subject_id').eq('id', moduleId).single()`
2. **Subject name**: `supabase.from('subjects').select('id, name').eq('id', subjectId).single()`
3. **Generated questions** (filtered by mode):

```typescript
let query = supabase
  .from('generated_questions')
  .select('id, question_no, question_text, question_type, estimated_marks, probability, study_mode_tag, source_topics')
  .eq('module_id', moduleId)
  .order('question_no', { ascending: true })

// Apply study mode filter
if (mode === '3h') {
  query = query.eq('study_mode_tag', 1)
} else if (mode === '8h') {
  query = query.lte('study_mode_tag', 2)
}
// '2day' = no filter, show all
```

Store in state:
```typescript
type GeneratedQuestion = {
  id: string
  question_no: number
  question_text: string
  question_type: string | null
  estimated_marks: number | null
  probability: string | null
  study_mode_tag: number
  source_topics: string[] | null
}

const [questions, setQuestions] = useState<GeneratedQuestion[]>([])
const [moduleInfo, setModuleInfo] = useState<{ module_no: number; title: string } | null>(null)
const [subjectName, setSubjectName] = useState<string>('')
const [loading, setLoading] = useState(true)
const [studyMode, setStudyMode] = useState<'3h' | '8h' | '2day'>(mode as any ?? '2day')
```

#### Layout structure:
```
[Full-page dark background: #000000]
  ├── Fixed navbar (← Module List | Module N: Title | mode badge)
  ├── Study Mode Switcher (same 3-button pill from parent page)
  │    └── Switching mode calls router.replace with new ?mode= param + refetches
  └── Questions Table
       ├── Header row: # | Question | Probability | Marks | ▶ Play
       ├── Q1 row ——————————————————————————————————————[▶]
       ├── Q2 row ——————————————————————————————————————[▶]
       └── QN row ——————————————————————————————————————[▶]
```

#### Question table design:
Container:
```
background: rgba(255,255,255,0.02)
border: 1px solid rgba(255,255,255,0.07)
border-radius: 16px
overflow: hidden
```

Header row:
```
background: rgba(255,255,255,0.04)
border-bottom: 1px solid rgba(255,255,255,0.07)
padding: 12px 24px
color: rgba(255,255,255,0.4)
font-size: 11px
font-weight: 600
text-transform: uppercase
letter-spacing: 0.08em
```

Question row:
```
border-bottom: 1px solid rgba(255,255,255,0.05)
padding: 16px 24px
display: flex
align-items: center
gap: 16px
transition: background 0.15s
```

Row hover: `background: rgba(255,255,255,0.03)`

Row columns:
1. **Number**: `#` in small monospace, `color: rgba(255,255,255,0.3)`, min-width 28px
2. **Question text**: `flex: 1`, `color: #F5F5F5`, `font-size: 15px`, `line-height: 1.5`
3. **Probability badge**: pill badge
   - `HIGH` → `background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); color: #10B981`
   - `MEDIUM` → `background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.3); color: #F59E0B`
   - `LOW` → `background: rgba(100,116,139,0.15); border: 1px solid rgba(100,116,139,0.3); color: #94A3B8`
   - Pill: `border-radius: 999px; padding: 3px 10px; font-size: 10px; font-weight: 700; letter-spacing: 0.05em`
4. **Marks**: small text `{estimated_marks}M` in `color: rgba(255,255,255,0.4); font-size: 12px; font-family: monospace; min-width: 36px; text-align: right`
5. **Play button**: `▶` icon button
   - `background: #7C3AED; border: none; border-radius: 8px; width: 36px; height: 36px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0`
   - Hover: `background: #8B5CF6; box-shadow: 0 0 16px rgba(124,58,237,0.5)`
   - On click: for now, show an alert or inline `div` below the row that says: `"✨ Answer generation coming soon — Phase 4"` in purple italic small text. Toggle on/off per row using a `Set<string>` in state.

#### Mode switching on this page:
The study mode switcher here is functional — switching replaces the URL query param and triggers a re-fetch:

```typescript
const handleModeChange = (newMode: '3h' | '8h' | '2day') => {
  setStudyMode(newMode)
  router.replace(`/questions/${subjectId}/${moduleId}?mode=${newMode}`)
  fetchQuestions(newMode)  // re-run query with new filter
}
```

#### Empty state (no questions yet):
When `questions.length === 0` and `loading === false`, show:

```
[Sparkles emoji large]
Questions haven't been generated yet
Run "Start the Research" first to generate questions for this module
[← Back to Module List button]
```

This handles the case where the user navigates here before Phase 4 (generation backend) is complete.

#### Loading state:
Skeleton rows — 6 rows, each a gray shimmer bar:
```
background: rgba(255,255,255,0.04)
border-radius: 8px
height: 56px
width: 100%
animation: pulse 1.5s ease-in-out infinite
```

#### Navigation:
- Back button top-left: `router.push(\`/questions/${subjectId}\`)` 
- Module title in navbar center
- Study mode badge in top-right: shows current mode

---

## DO NOT TOUCH

- `app/dev-test/page.tsx` beyond the two specific changes described above (redirect after generate, remove inline results block)
- All API routes
- All Trigger.dev tasks
- All Supabase migrations
- All existing components in `components/ui/`
- `app/page.tsx` (homepage) — read-only reference
- `lib/` directory

---

## DONE CRITERIA

Phase 2 is complete when:
1. `app/dev-test/page.tsx`: clicking "Start the Research" → 1500ms delay → redirects to `/questions/[subjectId]`
2. `app/dev-test/page.tsx`: the inline prediction scores block below the button is removed
3. `/questions/[subjectId]` page renders with: navbar, mode switcher, stacked module cards, loading skeletons, empty state
4. Clicking a module card navigates to `/questions/[subjectId]/[moduleId]?mode=2day`
5. `/questions/[subjectId]/[moduleId]` renders with: navbar, mode switcher, question table, probability badges, play buttons (with Phase 4 placeholder message), loading skeletons, empty state
6. Mode switching on the module page updates the URL param and re-filters questions from Supabase
7. The UI matches the dark homepage theme: black background, purple accents, framer-motion animations, glassmorphism panels
8. `npm run build` passes with zero TypeScript errors
