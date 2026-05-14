# ETSM Signals Pipeline — SP + Notes Extraction + NC

**Architect:** Opus 4.6  
**Date:** 2026-04-10  
**Scope:** Build the SP (Syllabus Prior) signal and overhaul the notes extraction pipeline to produce the NC (Notes Coverage) signal alongside improved RAG output.

---

## Architecture Overview

Two independent signal pipelines feeding into a future ETSM scoring engine:

```
SYLLABUS UPLOAD → extract modules/topics → student confirms scope
                                                    ↓
                                            PHASE 0: SP SIGNAL
                                            LLM scores domain centrality per topic
                                            Stored in topic_sp_scores table
                                            Read at prediction time as p_prior

NOTES UPLOAD → single Gemini call → two parallel outputs
                    ↓                           ↓
              RAG OUTPUT                  PREDICTION OUTPUT
              concept_intel → Qdrant      topic_map → nc_topic_map
              verbatim → Qdrant           topic_coverage → compute NC
              diagrams → Qdrant           NC scores → nc_scores table
                                          Read at prediction time as e_notes
```

---

## Live Database State (Verified via MCP)

**Existing tables (relevant):**

| Table | Key Columns |
|-------|------------|
| `modules` | id (uuid), subject_id, module_no, title, created_at — **NO description column** |
| `topics` | id (uuid), subject_id, module_id, name, description, importance_raw, is_core, topic_no, sub_topics (jsonb) |
| `subjects` | id (uuid), user_id, name, college_id |
| `exam_scopes` | id, subject_id, user_id, exam_type |
| `exam_scope_topics` | exam_scope_id, topic_id, selected_sub_topics (jsonb) |
| `qdrant_notes_metadata` | id, college_id, subject_id, uploader_id, original_filename, file_type, teacher_name, storage_path, chunk_count, total_tokens, processing_status, doc_summary, key_topics, condensation_stats, syllabus_match_score — **NO page_count column** |
| `prediction_runs` | id, subject_id, user_id, exam_label, exam_type, modules_in_scope, time_available_mins — **EMPTY, no app code** |
| `prediction_topic_scores` | prediction_run_id, topic_id, f_tests, f_assign, e_teacher, **e_notes**, **p_prior**, base_score, synergy_score, teacher_floor, final_score, band — **EMPTY, no app code** |

**Existing enums:** `priority_band` (HIGH, MEDIUM, LOW), `exam_type` (TERM TEST 1, TERM TEST 2, END SEMISTER EXAMINATION)

**Key existing files:**

| File | Purpose |
|------|---------|
| `lib/ai-prompts.ts` | All AI prompts — has `buildNotesCondensationPrompt()` to be replaced |
| `lib/ai-limits.ts` | Model names, token limits — `GEMINI_MODEL_NOTES = "gemini-2.5-flash-lite"` |
| `lib/extraction/ai.ts` | `condenseFileDirectly()` → to be replaced with `extractNotesIntel()`. Also has Google File API helpers (keep unchanged) |
| `lib/qdrant/types.ts` | `NoteChunkPayload` interface — needs new chunk tiers |
| `lib/qdrant/operations.ts` | Upsert/search/delete — no changes needed |
| `lib/qdrant/client.ts` | Qdrant client singleton — no changes needed |
| `lib/embeddings/google.ts` | Embedding generation — no changes needed |
| `trigger/tasks/process-notes-qdrant.ts` | Main notes processing task — heavy rewiring |
| `trigger/tasks/process-syllabus.ts` | Syllabus extraction — no changes needed |
| `app/api/exam-scopes/route.ts` | Exam scope save — needs to trigger SP task |
| `app/api/notes-v2/upload/route.ts` | Notes upload — needs page count extraction |
| `lib/supabase-worker.ts` | Supabase client for Trigger.dev workers |

---

## Design Decisions (Confirmed by Ammar)

1. **No module description needed** — SP uses module title + topic names + subtopics (all already stored in DB)
2. **Single LLM call** — One call with the full subject scope (all modules + topics), not one call per module
3. **SP trigger** — Async Trigger.dev task after exam scope save (non-blocking)
4. **SP recompute** — Fires on every scope save (upsert semantics)
5. **Page count** — Use `pdf-lib` in upload route
6. **No backward compat** — Development phase, old Qdrant data doesn't matter

---

# PHASE 0 — SP Signal (Syllabus Prior)

## What Codex Must Build

The SP signal pipeline: a Supabase table for scores, a single-call LLM centrality scoring engine (one call for entire subject), a Trigger.dev background task, and the wiring into the exam-scopes API.

**Key design: ONE LLM call per subject, not per module.** The LLM receives the full scope JSON (all modules with their topics and subtopics) and returns centrality scores for every topic in one pass. This gives the LLM full subject context and costs 1 API call instead of 6.

**No module description needed.** The LLM already has vast knowledge about engineering topics. Module title gives domain framing. Topic names + subtopics give the candidates. That's all it needs.

## Phase 0, Step 1: Supabase Migration

**File:** `supabase/migrations/20260401000000_add_sp_tables.sql`  
**Action:** CREATE NEW

This migration creates the `topic_sp_scores` table:

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, default gen_random_uuid() |
| subject_id | UUID | NOT NULL, FK → subjects(id) ON DELETE CASCADE |
| module_id | UUID | NOT NULL, FK → modules(id) ON DELETE CASCADE |
| topic_id | UUID | NOT NULL, FK → topics(id) ON DELETE CASCADE |
| centrality_score | FLOAT | NOT NULL, range 0.0-1.0 |
| computed_at | TIMESTAMPTZ | DEFAULT now() |

Constraints:
- `UNIQUE (topic_id)` — one SP score per topic, re-running overwrites

Indexes:
- `idx_sp_scores_subject` on (subject_id)
- `idx_sp_scores_module` on (module_id)

RLS:
- Enable RLS
- Service role: full access (FOR ALL TO service_role USING (true))
- Authenticated: SELECT only where subject_id belongs to user (`subject_id IN (SELECT id FROM subjects WHERE user_id = auth.uid())`)

No changes to `modules` table. No changes to any RPC functions.

---

## Phase 0, Step 2: SP Prompt + Computation Engine

### File: `lib/ai-prompts.ts`
**Action:** MODIFY (add new function)

Add a new exported function `buildSPPrompt`:

```
buildSPPrompt({ scope }): string
```

Parameters:
- `scope: Array<{ moduleNo: number; moduleTitle: string; topics: Array<{ name: string; subtopics: string[] }> }>`

The prompt takes the **full subject scope** — all modules with their topics and subtopics — and instructs the LLM to score centrality for every topic in one pass.

**Prompt instruction (from Ammar's spec):**

```
Score domain centrality for each topic within its own module.
Score independently per module — do not compare topics across modules.
A topic scoring 0.9 in Module 1 and a topic scoring 0.9 in Module 3
are both domain centers of their respective modules.

Use only:
  - module title as domain framing
  - topic name and subtopics as candidates

0.9-1.0  → this IS what the module is fundamentally teaching
0.7-0.8  → major component, directly constitutes core subject matter
0.5-0.6  → important supporting concept
0.3-0.4  → exists to explain something else
0.1-0.2  → peripheral, sub-detail
```

**Input format embedded in prompt:**
```json
[
  {
    "module": 1,
    "title": "Introduction to Generative AI & Transformer Architecture",
    "topics": [
      { "name": "Transformer Architecture", "subtopics": ["encoders", "decoders", "attention mechanisms"] },
      { "name": "RLHF", "subtopics": ["reinforcement learning from human feedback"] },
      { "name": "Tokenization", "subtopics": [] }
    ]
  },
  {
    "module": 2,
    "title": "Language Models - Unveiling the Power of Words",
    "topics": [...]
  }
]
```

**Expected output schema:**
```json
{
  "scores": [
    { "module": 1, "topic_name": "Transformer Architecture", "centrality_score": 0.95 },
    { "module": 1, "topic_name": "RLHF", "centrality_score": 0.65 },
    { "module": 1, "topic_name": "Tokenization", "centrality_score": 0.45 },
    { "module": 2, "topic_name": "BERT", "centrality_score": 0.90 }
  ]
}
```

### File: `lib/sp/compute.ts`
**Action:** CREATE NEW

Exports:

```typescript
export interface SPModuleInput {
  moduleNo: number;
  moduleTitle: string;
  topics: Array<{ id: string; name: string; subtopics: string[] }>;
}

export interface SPResult {
  topicId: string;
  topicName: string;
  moduleNo: number;
  centralityScore: number;
}

export async function computeSP(modules: SPModuleInput[]): Promise<SPResult[]>
```

Implementation:
1. Import `GoogleGenAI` from `@google/genai` — lazy-load singleton like in `lib/extraction/ai.ts`
2. Import `GEMINI_MODEL_NOTES` from `lib/ai-limits`
3. Import `buildSPPrompt` from `lib/ai-prompts`
4. Build the scope JSON from modules input
5. Build prompt via `buildSPPrompt({ scope })`
6. **One Gemini call** with `responseMimeType: 'application/json'`, `temperature: 0.2`, `maxOutputTokens: 2048`
7. Parse JSON response → array of `{ module, topic_name, centrality_score }`
8. Map topic names back to topic IDs from the input (case-insensitive match)
9. Return array of `SPResult`
10. If a topic name from Gemini doesn't match any input topic, log a warning and skip it

### File: `lib/sp/index.ts`
**Action:** CREATE NEW

Barrel export: re-export everything from `./compute`.

---

## Phase 0, Step 3: SP Trigger.dev Task

### File: `trigger/tasks/compute-sp.ts`
**Action:** CREATE NEW

Task definition:
- `id: 'compute-sp'`
- `retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 15000 }`

Payload:
```typescript
{
  subjectId: string;
  topicIds: string[];   // confirmed topic IDs from exam scope
}
```

Run function logic:
1. Create Supabase admin client (same pattern as `process-notes-qdrant.ts` — `createClient` with service key)
2. Fetch all modules for this subject: `SELECT id, module_no, title FROM modules WHERE subject_id = ?`
3. Fetch all confirmed topics with their subtopics: `SELECT id, name, module_id, sub_topics FROM topics WHERE subject_id = ? AND id = ANY(?)`
4. Build the `SPModuleInput[]` array: group topics by module, include subtopics from `topics.sub_topics` jsonb column
5. **One call:** `computeSP(modules)` — returns centrality scores for all topics
6. Resolve module_id for each result (from the modules query)
7. Upsert all results into `topic_sp_scores`:
   - Batch upsert: `INSERT INTO topic_sp_scores (subject_id, module_id, topic_id, centrality_score) VALUES (...) ON CONFLICT (topic_id) DO UPDATE SET centrality_score = EXCLUDED.centrality_score, computed_at = now()`
8. Log completion with count of topics scored

Do NOT touch: any existing task files.

### File: `trigger/index.ts`
**Action:** MODIFY

Add export for the new task file (if the current file re-exports tasks, add the new one).

---

## Phase 0, Step 4: Wire SP into Exam Scopes API

### File: `app/api/exam-scopes/route.ts`
**Action:** MODIFY

In the `POST` handler, after the `save_exam_scope_with_sub_topics` RPC succeeds (around line 116), add:

1. Dynamic import of `@trigger.dev/sdk`
2. Trigger the compute-sp task with the subject_id and topicIds
3. Wrap in try-catch — if trigger fails, log warning but don't fail the scope save
4. Optionally return the trigger run ID in the response (non-breaking addition)

Do NOT touch: the GET handler, the input validation, the RPC call, or any other existing logic.

---

## Phase 0: What "Done" Looks Like

- [ ] `topic_sp_scores` table exists in Supabase with correct schema, indexes, RLS
- [ ] `buildSPPrompt()` exists in `lib/ai-prompts.ts` — takes full scope, not per-module
- [ ] `lib/sp/compute.ts` makes ONE Gemini call with full scope and returns centrality scores
- [ ] `trigger/tasks/compute-sp.ts` fetches modules + topics + subtopics, calls compute, upserts results
- [ ] `POST /api/exam-scopes` triggers SP task after scope save
- [ ] `npm run build` passes with zero TypeScript errors

---

# PHASE 1 — Notes Extraction Overhaul + NC Signal

## What Codex Must Build

Replace the entire notes extraction output schema. A single Gemini call now produces `NotesIntelResult` (topic_map, topic_coverage, concept_intel, verbatim, diagrams) instead of `SinglePassResult` (digest_chunks, verbatim_chunks). The NC signal is computed from topic_coverage and stored in Supabase.

## Phase 1, Step 1: Supabase Migration

**File:** `supabase/migrations/20260401000001_add_nc_tables.sql`  
**Action:** CREATE NEW

**A) Create `nc_scores` table:**

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, default gen_random_uuid() |
| subject_id | UUID | NOT NULL, FK → subjects(id) ON DELETE CASCADE |
| module_id | UUID | FK → modules(id) ON DELETE SET NULL |
| topic_id | UUID | NOT NULL, FK → topics(id) ON DELETE CASCADE |
| note_file_id | UUID | NOT NULL, FK → qdrant_notes_metadata(id) ON DELETE CASCADE |
| nc_file_score | FLOAT | NOT NULL |
| file_weight | FLOAT | NOT NULL |
| depth_breakdown | JSONB | NOT NULL |
| created_at | TIMESTAMPTZ | DEFAULT now() |

Constraint: `UNIQUE (topic_id, note_file_id)`

Indexes: on subject_id, on note_file_id

**B) Create `nc_topic_map` table:**

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, default gen_random_uuid() |
| subject_id | UUID | NOT NULL, FK → subjects(id) ON DELETE CASCADE |
| module_id | UUID | FK → modules(id) ON DELETE SET NULL |
| topic_id | UUID | NOT NULL, FK → topics(id) ON DELETE CASCADE |
| note_file_id | UUID | NOT NULL, FK → qdrant_notes_metadata(id) ON DELETE CASCADE |
| subtopics_covered | TEXT[] | NOT NULL, DEFAULT '{}' |
| not_covered | TEXT[] | NOT NULL, DEFAULT '{}' |
| created_at | TIMESTAMPTZ | DEFAULT now() |

Constraint: `UNIQUE (topic_id, note_file_id)`

Indexes: on subject_id, on note_file_id

**C) RLS for both tables:**
- Enable RLS
- Service role: full access
- Authenticated: SELECT where subject_id belongs to user

**D) Add `page_count` to `qdrant_notes_metadata`:**
```
ALTER TABLE qdrant_notes_metadata ADD COLUMN IF NOT EXISTS page_count INTEGER;
```

---

## Phase 1, Step 2: NotesIntelResult Interface

### File: `lib/extraction/notes-intel.ts`
**Action:** CREATE NEW

Define the `NotesIntelResult` interface exactly as specified:

```typescript
export interface NotesIntelResult {
  source_file_name: string;

  topic_map: Array<{
    topic: string;
    subtopics_covered: string[];
    not_covered: string[];
  }>;

  topic_coverage: Array<{
    topic: string;
    has_derivation: boolean;
    has_worked_example: boolean;
    has_definition: boolean;
    has_diagram: boolean;
    has_code: boolean;
    mention_density: number;
    explanation_depth: number;
    explicitly_highlighted: boolean;
    coverage_confidence: number;
  }>;

  concept_intel: Array<{
    topic: string;
    subtopic: string;
    intel: string;
    page_range: string;
  }>;

  verbatim: Array<{
    topic: string;
    type: string;
    label: string;
    content: string;
    page: string;
  }>;

  diagrams: Array<{
    topic: string;
    description: string;
    page: string;
  }>;
}
```

---

## Phase 1, Step 3: AI Prompt Replacement

### File: `lib/ai-prompts.ts`
**Action:** MODIFY

1. **Remove** `buildNotesCondensationPrompt()` function entirely
2. **Add** `buildNotesIntelPrompt({ syllabusTopics, originalFilename })` function

The new prompt must request five output sections: `topic_map`, `topic_coverage`, `concept_intel`, `verbatim`, `diagrams`.

Key prompt instructions (from the spec):

For `concept_intel`:
```
You are extracting precise teaching intel, not summarising.
For each concept the teacher covered, write 50-80 words describing:
- what specific aspect of this concept was taught
- what approach or angle the teacher used
- what it was connected to or contrasted with
Do NOT write a general explanation of the concept.
Write what THIS teacher taught about it in THESE notes.
```

For `verbatim` type:
```
For verbatim chunks, freely name the type based on what it actually is.
Do not restrict yourself to predefined types.
Examples: "formula", "definition", "theorem_proof", "worked_numerical",
"comparison_table", "algorithm_pseudocode", "code_snippet", "protocol_steps"
```

For `topic_coverage`:
```
For each topic, provide a structured fingerprint:
- has_derivation: step-by-step working shown (boolean)
- has_worked_example: solved numerical or applied example (boolean)
- has_definition: formal stated definition (boolean)
- has_diagram: figure or visual present (boolean)
- has_code: implementation or pseudocode (boolean)
- mention_density: 0-1, how spread across document
- explanation_depth: 0-1, surface mention vs full treatment
- explicitly_highlighted: teacher marked as important (boolean)
- coverage_confidence: 0-1, your confidence in this assessment
```

Include the syllabus topics allowlist and source_file_name grounding (same pattern as current prompt).

Output schema must match `NotesIntelResult` exactly.

---

## Phase 1, Step 4: Extraction Module Update

### File: `lib/extraction/ai.ts`
**Action:** MODIFY

1. **Remove** `SinglePassResult` interface (lines 135-141)
2. **Remove** `condenseFileDirectly()` function (lines 143-174)
3. **Add** import of `NotesIntelResult` from `./notes-intel`
4. **Add** import of `buildNotesIntelPrompt` from `@/lib/ai-prompts`
5. **Remove** import of `buildNotesCondensationPrompt`
6. **Add** new function:

```typescript
export async function extractNotesIntel(
  fileUri: string,
  mimeType: string,
  syllabusTopics: string[],
  originalFilename: string,
  pageCount: number
): Promise<NotesIntelResult>
```

Implementation:
- Build prompt via `buildNotesIntelPrompt({ syllabusTopics, originalFilename })`
- Dynamic maxOutputTokens: `pageCount > 60 ? 16000 : 8192`
- Call `ai.models.generateContent()` with the same pattern as current `condenseFileDirectly` (fileData part + text part)
- Use `responseMimeType: 'application/json'`, `temperature: 0.2`
- Parse and return as `NotesIntelResult`

Keep ALL Google File API helpers unchanged: `uploadToGoogleFileAPI`, `waitForFileActive`, `deleteGoogleFile`, `getExtractionAI`.

---

## Phase 1, Step 5: NC Computation Engine

### File: `lib/nc/compute.ts`
**Action:** CREATE NEW

Pure functions — no DB calls, no side effects.

**Export 1: `NCFileResult` interface**

```typescript
export interface NCFileResult {
  topic: string;
  nc_file_score: number;
  depth_breakdown: {
    has_derivation: boolean;
    has_worked_example: boolean;
    has_definition: boolean;
    has_diagram: boolean;
    has_code: boolean;
    mention_density: number;
    explanation_depth: number;
    explicitly_highlighted: boolean;
    coverage_confidence: number;
    not_covered_penalty_applied: boolean;
  };
}
```

**Export 2: `computeNCFileScores(topicCoverage, topicMap)`**

Takes `NotesIntelResult['topic_coverage']` and `NotesIntelResult['topic_map']`.

For each topic in topicCoverage:

Step 1 — Depth Score:
```
depth_score = 0.30 × explanation_depth
            + 0.25 × (has_derivation ? 1 : 0)
            + 0.20 × (has_worked_example ? 1 : 0)
            + 0.15 × (has_diagram ? 1 : 0)
            + 0.10 × (has_definition ? 1 : 0)
```

Step 2 — Emphasis Score:
```
emphasis_score = 0.50 × mention_density
               + 0.50 × (explicitly_highlighted ? 1 : 0)
```

Step 3 — NC File Score:
```
nc_file = (0.65 × depth_score + 0.35 × emphasis_score) × coverage_confidence
```

Step 4 — Not-Covered Penalty:
Check if the topic appears in any `topicMap` entry's `not_covered` array. If yes:
```
nc_file = nc_file × 0.5
```

Return array of `NCFileResult` with the breakdown.

**Export 3: `computeFileWeight(pageCount: number): number`**
```
return Math.min(1.0, pageCount / 60)
```

### File: `lib/nc/index.ts`
**Action:** CREATE NEW

Barrel export: re-export everything from `./compute`.

---

## Phase 1, Step 6: Qdrant Types Update

### File: `lib/qdrant/types.ts`
**Action:** MODIFY

Update `NoteChunkPayload` interface:

1. Change `chunk_tier` type to: `'concept_intel' | 'verbatim' | 'diagram'`
2. Change `verbatim_type` from enum to `string | undefined` (free text)
3. Add new optional fields:
   - `subtopic?: string`
   - `label?: string`  
   - `page?: string`
4. Mark `teacher_emphasis` as optional/legacy (keep but don't require)
5. Mark `digest_text` as optional/legacy

Do NOT touch: `UpsertChunkInput`, `NoteSearchFilters`, `NoteSearchResult`, `NoteDiscoveryItem`, `QdrantStorageStats`, or the legacy type definitions at the bottom of the file (`CriticalItem`, `CondensedSection`, `CondensedNotesResult`).

---

## Phase 1, Step 7: Task Rewiring + Upload Route

### File: `trigger/tasks/process-notes-qdrant.ts`
**Action:** MODIFY (heavy)

**Payload change:** Add `pageCount: number` to the task payload type (line ~238).

**Import changes:**
- Replace `condenseFileDirectly` import → `extractNotesIntel` from `@/lib/extraction/ai`
- Replace `SinglePassResult` import → `NotesIntelResult` from `@/lib/extraction/notes-intel`
- Add import of `computeNCFileScores, computeFileWeight` from `@/lib/nc`

**Core logic changes (inside the try block, lines ~296-318):**

1. Replace the `condenseFileDirectly` call with `extractNotesIntel(resolvedFileUri, mimeType, syllabusTopics, originalFilename, payload.pageCount)`

2. Replace the `doc_summary, key_topics, digest_chunks, verbatim_chunks` destructure with the new result shape: `topic_map, topic_coverage, concept_intel, verbatim, diagrams`

3. Replace the chunk count check: `totalChunks = concept_intel.length + verbatim.length + diagrams.length`

4. **Replace the two mapping loops** (lines ~329-389) with three loops:

   **Loop 1: concept_intel → chunk_tier: 'concept_intel'**
   - content = the `intel` text
   - matched_syllabus_topics = [item.topic]
   - subtopic = item.subtopic
   - source_page_range = item.page_range

   **Loop 2: verbatim → chunk_tier: 'verbatim'**
   - content = item.content
   - verbatim_type = item.type (free text string)
   - label = item.label
   - matched_syllabus_topics = [item.topic]
   - page = item.page

   **Loop 3: diagrams → chunk_tier: 'diagram'**
   - content = item.description
   - matched_syllabus_topics = [item.topic]
   - page = item.page

5. **After Qdrant upsert, add NC computation block:**
   - Fetch topic IDs: query `topics` table for this subject, get `{id, name, module_id}` for all topics
   - Build a name→ID+moduleID map (case-insensitive)
   - Call `computeNCFileScores(topic_coverage, topic_map)`
   - Call `computeFileWeight(payload.pageCount)`
   - For each NCFileResult, resolve topic name to topic ID
   - Batch insert into `nc_scores` (upsert with ON CONFLICT (topic_id, note_file_id)):
     ```
     { subject_id, module_id, topic_id, note_file_id: metadataId, nc_file_score, file_weight, depth_breakdown }
     ```
   - Batch insert into `nc_topic_map` (upsert with ON CONFLICT (topic_id, note_file_id)):
     For each topic_map entry, resolve topic name to ID and insert:
     ```
     { subject_id, module_id, topic_id, note_file_id: metadataId, subtopics_covered, not_covered }
     ```

6. **Update metadata finalization (line ~423-432):**
   - Add `page_count: payload.pageCount`
   - Derive `key_topics` from `topic_map.map(t => t.topic)` instead of Gemini output
   - Set `doc_summary` to null (no longer produced)

**Keep unchanged:** download logic, Google File API logic, embedding generation, Qdrant upsert call, deduplication logic, error handling, cleanup, progress tracking structure.

### File: `app/api/notes-v2/upload/route.ts`
**Action:** MODIFY

1. Add `pdf-lib` import: `import { PDFDocument } from 'pdf-lib'`
2. After reading the file buffer (line ~175), extract page count:
   ```
   const pdfDoc = await PDFDocument.load(fileBuffer);
   const pageCount = pdfDoc.getPageCount();
   ```
3. Add `pageCount` to the trigger payload (line ~241-251)
4. Optionally store pageCount in the metadata insert as well (line ~211-223)

### Package dependency:
- `pdf-lib` needs to be installed: `npm install pdf-lib`

---

## Phase 1: What "Done" Looks Like

- [ ] `nc_scores` and `nc_topic_map` tables exist in Supabase with correct schema
- [ ] `qdrant_notes_metadata.page_count` column exists
- [ ] `NotesIntelResult` interface exists in `lib/extraction/notes-intel.ts`
- [ ] `buildNotesIntelPrompt()` replaces `buildNotesCondensationPrompt()` in `lib/ai-prompts.ts`
- [ ] `extractNotesIntel()` replaces `condenseFileDirectly()` in `lib/extraction/ai.ts`
- [ ] `lib/nc/compute.ts` implements all NC formulas correctly
- [ ] `NoteChunkPayload` supports new chunk tiers
- [ ] `process-notes-qdrant.ts` produces concept_intel/verbatim/diagram chunks and computes NC scores
- [ ] Upload route extracts PDF page count via `pdf-lib`
- [ ] NC scores are inserted into Supabase after notes processing
- [ ] `npm run build` passes with zero TypeScript errors

---

# DO NOT TOUCH

These files/systems must not be modified in either phase:

- `lib/qdrant/client.ts` — Qdrant connection (no changes)
- `lib/qdrant/operations.ts` — search/upsert/delete logic (no changes)
- `lib/embeddings/` — embedding generation (no changes)
- `trigger/tasks/process-questions.ts` — question processing (unrelated)
- `trigger/tasks/process-pyq.ts` — PYQ processing (unrelated)
- `trigger/tasks/cleanup-expired-notes.ts` — cleanup (unrelated)
- `app/api/notes-v2/upload/route.ts` GET handler (if any)
- Any frontend/UI files
- `prediction_runs` / `prediction_topic_scores` tables — these are for the future ETSM engine, not this work
