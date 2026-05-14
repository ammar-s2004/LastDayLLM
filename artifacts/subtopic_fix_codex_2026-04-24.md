# Codex Task: Sub-Topic Architecture Fix
**Date:** 2026-04-24  
**Project:** LastDayLLM (`c:\Users\Ammar\Desktop\LastDayLLM`)

---

## CONTEXT

The DB `topics` table has a parent/child structure:
- **Parent topics** = syllabus headings (e.g. "Unit Testing", "Acceptance Testing") — `parent_topic_id IS NULL`
- **Child topics** = actual scorable sub-topics (e.g. "Concept of Unit Testing") — `parent_topic_id = <parent uuid>`

After a migration that promoted sub-topics to child rows, **the exam scope modal broke** because the topics query now returns both parents AND children. Children appear as duplicate checkboxes below the parent.

**Three targeted fixes required. No DB changes. No architectural changes.**

---

## FIX 1 — Filter Child Topics From Exam Scope Modal

### File: `app/dev-test/page.tsx`

**Around line 392**, inside the `loadSubjects` async function, change the embedded topics select to also fetch `parent_topic_id`:

BEFORE:
```ts
topics:topics(id, name, topic_no, sub_topics)
```

AFTER:
```ts
topics:topics(id, name, topic_no, sub_topics, parent_topic_id)
```

**Around line 21-32**, update the Subject interface topics array type — add `parent_topic_id?: string | null` to the topic object shape.

**In the JSX section** where module topics are mapped for the scope modal checkboxes, add a filter before `.map()`:

```tsx
module.topics
  .filter((topic) => topic.parent_topic_id == null)
  .map((topic) => ( /* existing render, unchanged */ ))
```

**Wherever `toggleScopeModule` is called in JSX**, filter to parent topics only when passing the topics array:

```tsx
onClick={() => toggleScopeModule(module.topics.filter(t => t.parent_topic_id == null))}
```

---

## FIX 2 — Show Parent › Child Format in Predictions Ranking

### File: `app/dev-test/page.tsx`

**Update `PredictionScore` interface** — add `parent` field to the nested `topics` object:

```ts
topics?: {
  name?: string | null
  module_id?: string | null
  parent_topic_id?: string | null
  parent?: { name?: string | null } | null   // ADD
} | null
```

Note: `app/api/predictions/route.ts` already returns `parent:topics!parent_topic_id(name)` in its select — DO NOT modify that file.

**In the JSX where prediction scores are rendered**, wherever `score.topics?.name` appears, replace with:

```tsx
{score.topics?.parent?.name
  ? `${score.topics.parent.name} › ${score.topics.name}`
  : score.topics?.name}
```

---

## FIX 3 — Guard Exam Scope API Against Child Topic IDs

### File: `app/api/exam-scopes/route.ts`

After the existing topic ownership check block (around line 89-101), add this guard immediately after:

```ts
/* ---------- PARENT TOPICS ONLY ---------- */
const { data: parentTopics } = await supabase
  .from('topics')
  .select('id')
  .eq('subject_id', subject_id)
  .in('id', topicIds)
  .is('parent_topic_id', null)

if (!parentTopics || parentTopics.length !== topicIds.length) {
  return NextResponse.json(
    { error: 'Exam scope must reference heading-level topics only, not sub-topics' },
    { status: 400 }
  )
}
```

Do not change the GET handler or anything else in this file.

---

## DO NOT TOUCH

- `app/api/predictions/route.ts` — already correct
- `lib/shared/resolve-children.ts` — already correct
- `trigger/tasks/compute-sp.ts` — already correct
- Any DB migrations — no schema changes

---

## DONE CRITERIA

1. Exam scope modal shows only parent (heading) topics as checkboxes — no child rows
2. Sub-topic badge chips still render from `sub_topics` JSONB — unaffected
3. Predictions ranking shows `"Unit Testing › Concept of Unit Testing"` for child topics
4. POST `/api/exam-scopes` with a child topic ID returns 400
5. TypeScript compiles with no new errors
