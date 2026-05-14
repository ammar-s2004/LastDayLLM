# NC MODULE OVERHAUL — CODEX EXECUTION SPEC

> **Date**: 2026-05-05
> **Objective**: Overhaul the Notes Coverage (NC) extraction prompt, scoring formula, and add multi-file aggregation. 51% output token reduction while maintaining child-topic granularity for fusion compatibility.

---

## CRITICAL CONTEXT

### How NC Fits in the System
The prediction engine fuses 5 signals per **child topic** (not parent topics):
- **SP** (Syllabus Prior) — `topic_sp_scores.centrality_score`
- **WTF** (Weighted Topic Frequency from PYQs) — `topic_wtf_scores.wtf_score`
- **TE** (Teacher Emphasis from hints) — `topic_te_scores.te_score`
- **A** (Academic from assignments/test papers) — `topic_a_scores.a_score`
- **NC** (Notes Coverage) — `nc_scores.nc_file_score` → aggregated per topic

NC MUST produce scores at the child-topic level. The STQA subject has 52 child topics across 6 modules.

### Current Pipeline Flow
```
PDF → Google File API → Gemini (buildNotesIntelPrompt) → NotesIntelResult
  → RAG chunks → Qdrant
  → NC scores → nc_scores table (per file per topic)
  → Topic map → nc_topic_map table
```

### What This Overhaul Changes
1. The AI prompt (compressed output, calibrated rubrics, full hierarchy input)
2. The TypeScript decoder layer (short keys → full keys)
3. The NC scoring formula (new weights, graduated penalty)
4. NEW: multi-file aggregation (cross-file spread bonus)

### What This Overhaul Does NOT Change
- Qdrant payload structure (`NoteChunkPayload` in `lib/qdrant/types.ts`) — unchanged
- Database schema (`nc_scores`, `nc_topic_map` tables) — unchanged
- The `NotesIntelResult` interface shape (it's the decoded output) — unchanged
- `process-notes-qdrant.ts` RAG chunk mapping logic — unchanged
- Any other signal pipeline (SP, TE, A, WTF) — unchanged

---

## PHASE 1: PROMPT + INTERFACE LAYER

### 1A. Update `lib/extraction/notes-intel.ts`

**Keep existing `NotesIntelResult` interface exactly as-is** (lines 1-43). It is the decoded format used by everything downstream.

**Add BELOW it** the following new types and decoder:

```ts
// ============================================================================
// Compressed AI Response Types (what Gemini returns)
// ============================================================================

export interface RawNotesIntelResult {
  tm: Array<{
    t: string;    // topic name (exact match from syllabus)
    sc: number;   // subtopics_covered count
    nc: string[]; // not_covered subtopic names
  }>;
  tc: Array<{
    t: string;    // topic name
    md: number;   // mention_density (0.0-1.0)
    ed: number;   // explanation_depth (0.0-1.0)
    cc: number;   // coverage_confidence (0.0-1.0)
    hd: boolean;  // has_derivation
    he: boolean;  // has_worked_example
    hf: boolean;  // has_definition
    hg: boolean;  // has_diagram
    hc: boolean;  // has_code
    eh: boolean;  // explicitly_highlighted
  }>;
  concept_intel: Array<{
    t: string;    // topic
    st: string;   // subtopic
    i: string;    // intel text (15-30 words)
    p: string;    // page_range
  }>;
  verbatim: Array<{
    t: string;    // topic
    ty: string;   // type (formula, definition, etc.)
    l: string;    // label
    c: string;    // content (exact text)
    p: string;    // page
  }>;
  diagrams: Array<{
    t: string;    // topic
    d: string;    // description (10-20 words)
    p: string;    // page
  }>;
}

// ============================================================================
// Decoder: compressed → full
// ============================================================================

export function decodeNotesIntel(
  raw: RawNotesIntelResult,
  filename: string
): NotesIntelResult {
  return {
    source_file_name: filename,

    topic_map: raw.tm.map((item) => ({
      topic: item.t,
      subtopics_covered: item.sc,
      not_covered: item.nc,
    })),

    topic_coverage: raw.tc.map((item) => ({
      topic: item.t,
      mention_density: item.md,
      explanation_depth: item.ed,
      coverage_confidence: item.cc,
      has_derivation: item.hd,
      has_worked_example: item.he,
      has_definition: item.hf,
      has_diagram: item.hg,
      has_code: item.hc,
      explicitly_highlighted: item.eh,
    })),

    concept_intel: raw.concept_intel.map((item) => ({
      topic: item.t,
      subtopic: item.st,
      intel: item.i,
      page_range: item.p,
    })),

    verbatim: raw.verbatim.map((item) => ({
      topic: item.t,
      type: item.ty,
      label: item.l,
      content: item.c,
      page: item.p,
    })),

    diagrams: raw.diagrams.map((item) => ({
      topic: item.t,
      description: item.d,
      page: item.p,
    })),
  };
}
```

**IMPORTANT**: The existing `NotesIntelResult` interface has `subtopics_covered` typed as `string[]`. In the compressed format, `tm.sc` is a `number` (count). The decoder maps `sc` → `subtopics_covered`. This is a TYPE MISMATCH. Fix: change `subtopics_covered` in `NotesIntelResult` from `string[]` to `number`. 

Wait — downstream in `process-notes-qdrant.ts` line 478, `subtopics_covered` is written to the `nc_topic_map` table which has column type `text[]`. So we need to keep `subtopics_covered` as `string[]` in the database.

**RESOLUTION**: Keep `tm` returning subtopic NAMES (not just count) in the compressed format. Update:
```ts
// In RawNotesIntelResult, change tm to:
tm: Array<{
  t: string;
  sc: string[];  // subtopic names covered (not count)
  nc: string[];  // subtopic names not covered
}>;
```

And in the decoder:
```ts
topic_map: raw.tm.map((item) => ({
  topic: item.t,
  subtopics_covered: item.sc,
  not_covered: item.nc,
})),
```

This preserves the `nc_topic_map` table's data structure.

---

### 1B. Rewrite `buildNotesIntelPrompt()` in `lib/ai-prompts.ts`

**Replace the entire `buildNotesIntelPrompt` function** (lines 203-321) with:

**New function signature:**
```ts
export interface SyllabusHierarchy {
  module_no: number;
  module_title: string;
  topics: Array<{ name: string; sub_topics: string[] }>;
}

export function buildNotesIntelPrompt({
  syllabusHierarchy,
  originalFilename,
}: {
  syllabusHierarchy: SyllabusHierarchy[];
  originalFilename: string;
}): string
```

**The complete prompt text** (this is the exact string to return):

```
You are the NC extraction engine for an academic prediction system.

TWO JOBS, ONE PASS:
1. RAG INTEL — extract compressed teaching coordinates for vector search
2. NC SIGNALS — evaluate how thoroughly this document covers each syllabus topic

═══ SYLLABUS SCOPE ═══
${JSON.stringify(syllabusHierarchy)}

═══ JOB 1: RAG EXTRACTION ═══

concept_intel: For each subtopic the teacher covered, write 15-30 keyword-dense
words capturing ONLY the teacher's specific angle/approach in THESE notes.
NOT textbook knowledge. What THIS teacher taught, how they framed it,
what they connected it to.

verbatim: Copy exact definitions, formulas, algorithms, worked examples,
comparison tables. Do NOT paraphrase. Type the content exactly as written.
For type, use whatever fits: "formula", "definition", "theorem", "worked_example",
"comparison_table", "algorithm", "code_snippet", "protocol_steps", etc.

diagrams: For each meaningful figure/table/visual, write a 10-20 word description
of what it shows. Just enough for semantic search to match.

═══ JOB 2: NC SIGNALS ═══

topic_map (tm): For each syllabus topic found in the document:
  - t: exact topic name from the syllabus scope
  - sc: array of subtopic name strings that were actually covered
  - nc: array of subtopic name strings that were MISSING from the document

topic_coverage (tc): For ONLY topics you actually found in the document:
  - t: exact topic name
  - md: mention_density (calibrated scale):
       0.0 = not present at all
       0.2 = named once in passing, no development
       0.4 = discussed on 1-2 pages with some detail
       0.6 = spread across 3-5 pages, meaningful coverage
       0.8 = major thread running through 5+ pages
       1.0 = dominant theme of the entire document
  - ed: explanation_depth (calibrated scale):
       0.0 = not explained at all
       0.2 = title-only or one-line mention
       0.4 = surface definition or brief description given
       0.6 = explained with structure, categories, or examples
       0.8 = thorough step-by-step breakdown
       1.0 = rigorous, exam-ready, complete treatment
  - cc: coverage_confidence (your confidence the teacher provided
       everything a student needs for this specific topic):
       0.0 = no useful content
       0.3 = fragmentary, student needs other sources
       0.6 = solid but incomplete coverage
       0.8 = strong coverage, minor gaps only
       1.0 = comprehensive, exam-ready
  - hd: true if step-by-step derivation/proof is shown
  - he: true if worked numerical/applied example is solved
  - hf: true if formal definition is explicitly stated
  - hg: true if diagram/figure/visual is present for this topic
  - hc: true if code/pseudocode is shown
  - eh: true if teacher explicitly flagged importance
       (e.g., "important for exam", bold/underlined emphasis, "note this")

OMIT any topic with zero presence. Do not report topics scored all-zero.
The decoder will default unreported topics to zero.

═══ CONSTRAINTS ═══
- Topic names MUST exactly match strings from the syllabus scope.
- Use child-topic names (e.g., "Static Unit Testing"), not parent names (e.g., "Unit Testing"), unless the parent itself is the only topic at that level.
- Do not hallucinate topics outside the provided syllabus.
- source_file_name must be exactly "${originalFilename}".
- Output ONLY valid JSON. No markdown fences, no commentary.

═══ JSON SCHEMA (use short keys exactly as shown) ═══
{
  "source_file_name": "${originalFilename}",
  "tm": [{"t":"Topic","sc":["Subtopic A","Subtopic B"],"nc":["Subtopic C"]}],
  "tc": [{"t":"Topic","md":0.6,"ed":0.4,"cc":0.7,"hd":false,"he":true,"hf":true,"hg":false,"hc":false,"eh":false}],
  "concept_intel": [{"t":"Topic","st":"Subtopic","i":"15-30 word intel","p":"3-5"}],
  "verbatim": [{"t":"Topic","ty":"formula","l":"Label","c":"exact text","p":"7"}],
  "diagrams": [{"t":"Topic","d":"10-20 word description","p":"12"}]
}
```

---

### 1C. Update `lib/extraction/ai.ts`

**Change the `extractNotesIntel` function signature** (line 137):

FROM:
```ts
export async function extractNotesIntel(
    fileUri: string,
    mimeType: string,
    syllabusTopics: string[],
    originalFilename: string,
    pageCount: number
): Promise<NotesIntelResult>
```

TO:
```ts
import type { SyllabusHierarchy } from '@/lib/ai-prompts';
import { decodeNotesIntel, type RawNotesIntelResult } from './notes-intel';

export async function extractNotesIntel(
    fileUri: string,
    mimeType: string,
    syllabusHierarchy: SyllabusHierarchy[],
    originalFilename: string,
    pageCount: number
): Promise<NotesIntelResult>
```

**Inside the function body**, change:
```ts
// OLD
const promptText = buildNotesIntelPrompt({ syllabusTopics, originalFilename });
// ...
return JSON.parse(response.text) as NotesIntelResult;

// NEW
const promptText = buildNotesIntelPrompt({ syllabusHierarchy, originalFilename });
// ...
const raw = JSON.parse(response.text) as RawNotesIntelResult;
return decodeNotesIntel(raw, originalFilename);
```

---

## PHASE 2: COMPUTE LOGIC

### 2A. Rewrite `lib/nc/compute.ts`

**Replace the `computeNCFileScores` function** with this logic:

```ts
export function computeNCFileScores(
  topicCoverage: NotesIntelResult["topic_coverage"],
  topicMap: NotesIntelResult["topic_map"]
): NCFileResult[] {
  // Build a map of topic → not_covered ratio
  const topicMapLookup = new Map(
    topicMap.map((entry) => [
      normalizeTopic(entry.topic),
      entry,
    ])
  );

  return topicCoverage.map((item) => {
    // Pedagogical richness: did the teacher invest effort?
    const richness =
      0.25 * item.explanation_depth +
      0.20 * (item.has_derivation ? 1 : 0) +
      0.20 * (item.has_worked_example ? 1 : 0) +
      0.15 * (item.has_diagram ? 1 : 0) +
      0.10 * (item.has_definition ? 1 : 0) +
      0.10 * (item.has_code ? 1 : 0);

    // Emphasis: how prominently did it feature?
    const emphasis =
      0.70 * item.mention_density +
      0.30 * (item.explicitly_highlighted ? 1 : 0);

    // Combine with confidence gate
    let ncFileScore =
      (0.55 * richness + 0.45 * emphasis) * item.coverage_confidence;

    // Graduated not-covered penalty
    const mapEntry = topicMapLookup.get(normalizeTopic(item.topic));
    let notCoveredPenaltyApplied = false;

    if (mapEntry) {
      const totalSubtopics = mapEntry.subtopics_covered.length + mapEntry.not_covered.length;
      if (totalSubtopics > 0) {
        const missRatio = mapEntry.not_covered.length / totalSubtopics;
        if (missRatio > 0.5) {
          ncFileScore *= 0.6;
          notCoveredPenaltyApplied = true;
        } else if (missRatio > 0.25) {
          ncFileScore *= 0.8;
          notCoveredPenaltyApplied = true;
        }
      }
    }

    return {
      topic: item.topic,
      nc_file_score: ncFileScore,
      depth_breakdown: {
        has_derivation: item.has_derivation,
        has_worked_example: item.has_worked_example,
        has_definition: item.has_definition,
        has_diagram: item.has_diagram,
        has_code: item.has_code,
        mention_density: item.mention_density,
        explanation_depth: item.explanation_depth,
        explicitly_highlighted: item.explicitly_highlighted,
        coverage_confidence: item.coverage_confidence,
        not_covered_penalty_applied: notCoveredPenaltyApplied,
      },
    };
  });
}
```

**Keep `computeFileWeight` unchanged.**

**Keep `NCFileResult` interface unchanged** — no downstream breakage.

---

## PHASE 3: MULTI-FILE AGGREGATION

### 3A. Create `lib/nc/aggregate.ts` (NEW FILE)

```ts
import { createClient } from '@supabase/supabase-js';

export interface AggregatedNCScore {
  topic_id: string;
  nc_final: number;
  file_count: number;
  best_file_score: number;
  spread_bonus: number;
}

/**
 * Aggregate NC scores across all note files for a given subject.
 * 
 * Algorithm:
 *   bestScore = max of (nc_file_score * file_weight) across all files
 *   spreadBonus = min(0.15, 0.05 * fileCount)
 *   avgBonus = mean(weighted scores) * 0.1
 *   nc_final = min(1.0, bestScore + spreadBonus + avgBonus)
 */
export async function aggregateNCScores(
  subjectId: string,
  supabase: ReturnType<typeof createClient>
): Promise<AggregatedNCScore[]> {
  const { data: rows, error } = await supabase
    .from('nc_scores')
    .select('topic_id, nc_file_score, file_weight')
    .eq('subject_id', subjectId);

  if (error || !rows || rows.length === 0) {
    return [];
  }

  // Group by topic_id
  const byTopic = new Map<string, Array<{ score: number; weight: number }>>();
  for (const row of rows) {
    const existing = byTopic.get(row.topic_id) ?? [];
    existing.push({ score: row.nc_file_score, weight: row.file_weight });
    byTopic.set(row.topic_id, existing);
  }

  const results: AggregatedNCScore[] = [];

  for (const [topicId, entries] of byTopic) {
    const weightedScores = entries.map((e) => e.score * e.weight);
    const bestScore = Math.max(...weightedScores);
    const fileCount = entries.length;
    const spreadBonus = Math.min(0.15, 0.05 * fileCount);
    const avgBonus = (weightedScores.reduce((a, b) => a + b, 0) / weightedScores.length) * 0.1;
    const ncFinal = Math.min(1.0, bestScore + spreadBonus + avgBonus);

    results.push({
      topic_id: topicId,
      nc_final: ncFinal,
      file_count: fileCount,
      best_file_score: bestScore,
      spread_bonus: spreadBonus,
    });
  }

  return results;
}
```

### 3B. Update `lib/nc/index.ts`

Change from:
```ts
export * from "./compute";
```
To:
```ts
export * from "./compute";
export * from "./aggregate";
```

---

## PHASE 4: PIPELINE PLUMBING

### 4A. Update `trigger/tasks/process-notes-qdrant.ts`

**Replace `getSubjectTopics` function** (lines 135-147) with:

```ts
import type { SyllabusHierarchy } from '@/lib/ai-prompts';

async function getSubjectHierarchy(
  subjectId: string,
  supabase: any
): Promise<{ hierarchy: SyllabusHierarchy[]; flatTopicNames: string[] }> {
  // Fetch modules
  const { data: modules } = await supabase
    .from('modules')
    .select('id, module_no, title')
    .eq('subject_id', subjectId)
    .order('module_no');

  // Fetch all topics (parents only — those with sub_topics arrays)
  const { data: topics } = await supabase
    .from('topics')
    .select('id, name, module_id, sub_topics, parent_topic_id')
    .eq('subject_id', subjectId)
    .order('topic_no');

  const flatTopicNames: string[] = (topics ?? []).map((t: any) => t.name);

  const hierarchy: SyllabusHierarchy[] = (modules ?? []).map((mod: any) => {
    // Get parent topics for this module (parent_topic_id is null)
    const parentTopics = (topics ?? [])
      .filter((t: any) => t.module_id === mod.id && t.parent_topic_id === null)
      .map((t: any) => ({
        name: t.name,
        sub_topics: (t.sub_topics ?? []) as string[],
      }));

    return {
      module_no: mod.module_no,
      module_title: mod.title,
      topics: parentTopics,
    };
  });

  return { hierarchy, flatTopicNames };
}
```

**Update the call site** (around line 275) — change:
```ts
// OLD
const syllabusTopics = await getSubjectTopics(subjectId, getSupabaseAdmin());
// ...
notesIntelResult = await extractNotesIntel(
    resolvedFileUri, mimeType, syllabusTopics, originalFilename, pageCount
);

// NEW
const { hierarchy, flatTopicNames } = await getSubjectHierarchy(subjectId, getSupabaseAdmin());
// ...
notesIntelResult = await extractNotesIntel(
    resolvedFileUri, mimeType, hierarchy, originalFilename, pageCount
);
```

Note: `flatTopicNames` is kept for any downstream uses that still need the flat list (like `keyTopics` on line 314).

**Add aggregation call** after NC scores are written (after line 491):

```ts
// After nc_topic_map upsert, run aggregation
import { aggregateNCScores } from '@/lib/nc';

const aggregated = await aggregateNCScores(subjectId, supabase);
logger.info('[Process] NC aggregation complete', {
  topicsAggregated: aggregated.length,
});
```

The aggregated scores are computed and logged. The prediction engine can read directly from `nc_scores` and apply the aggregation formula, OR we can store `nc_final` in a new column. For now, compute on-the-fly is fine — it's a simple in-memory operation.

---

## FILES CHANGED SUMMARY

| File | Action | Phase |
|------|--------|-------|
| `lib/extraction/notes-intel.ts` | ADD `RawNotesIntelResult` + `decodeNotesIntel()` | 1 |
| `lib/ai-prompts.ts` | REWRITE `buildNotesIntelPrompt()` + ADD `SyllabusHierarchy` type | 1 |
| `lib/extraction/ai.ts` | UPDATE signature + add decoder call | 1 |
| `lib/nc/compute.ts` | REWRITE scoring formula | 2 |
| `lib/nc/aggregate.ts` | NEW FILE — multi-file aggregation | 3 |
| `lib/nc/index.ts` | ADD export for aggregate | 3 |
| `trigger/tasks/process-notes-qdrant.ts` | UPDATE topic fetching + add aggregation call | 4 |

## WHAT CODEX MUST NOT TOUCH
- `lib/qdrant/types.ts` — no changes to Qdrant payload types
- `lib/qdrant/operations.ts` — no changes to Qdrant operations
- `lib/embeddings/` — no changes to embedding logic
- `trigger/tasks/compute-sp.ts` — SP pipeline unchanged
- `trigger/tasks/compute-te.ts` — TE pipeline unchanged
- `trigger/tasks/compute-wtf.ts` — WTF pipeline unchanged
- `trigger/tasks/compute-a.ts` — A pipeline unchanged
- `lib/sp/`, `lib/te/`, `lib/wtf/`, `lib/a/` — all unchanged
- Database schema — no migrations needed
- Qdrant collection schema — no changes

## "DONE" CRITERIA PER PHASE
- **Phase 1**: `extractNotesIntel()` accepts `SyllabusHierarchy[]`, returns `NotesIntelResult` via decoder. TypeScript compiles with no errors.
- **Phase 2**: `computeNCFileScores()` uses new formula. All existing call sites still work.
- **Phase 3**: `aggregate.ts` exists, exports `aggregateNCScores()`. `lib/nc/index.ts` re-exports it.
- **Phase 4**: `process-notes-qdrant.ts` fetches hierarchy, passes to extraction, calls aggregation. Full pipeline compiles.
