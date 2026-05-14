# Context Sheet: Smart Notes Condensation — Phase 3/4

## WHAT TO WRITE
1. `async function getSubjectTopics(subjectId: string, supabase: any): Promise<string[]>` — fetches topic names for a subject.
2. A replacement code block for Step 4-7 in the main pipeline. This block takes the raw `extractedText`, condenses it using AI, generates embeddings for all resulting chunks (digest + verbatim), and maps them into Qdrant point objects.

## TARGET FILE
- `trigger/tasks/process-notes-qdrant.ts` — [MODIFY]
- Existing exports: `export const processNotesQdrantTask`

## PHASE DEPENDENCIES
- Depends on Phase 2 (already added `condenseExtractedNotes` and `CondensationResult` to `lib/extraction/ai.ts`).

## PROJECT PATTERNS
- DB client is passed in (no internal instantiation needed for the helper).
- Async: `async/await` only — no `.then()` chains.
- Trigger.dev metadata logging: `metadata.set()`, `updateProgress()`.

## EXISTING CODE (Context)
```ts
// Existing helper signature available:
async function updateProgress(metadataId: string, jobId: string, stage: string, progress: number, message: string)

// Existing Qdrant Types (lib/qdrant/types.ts):
export type UpsertChunkInput = { id: string; vector: number[]; payload: NoteChunkPayload };
export interface NoteChunkPayload {
  upload_id: string; chunk_index: number; college_id: string; college_name: string; subject_id: string; subject_name: string; filename: string; file_type: string; teacher_name: string | null; content: string;
  chunk_tier: 'verbatim' | 'digest';
  verbatim_type?: 'formula' | 'definition' | 'example' | 'code';
  section_context?: string;
  teacher_emphasis?: string[];
  matched_syllabus_topics?: string[];
  source_page_range?: string;
  topic_tags?: string[]; file_summary?: string; key_topics?: string[]; diagram_urls?: string[]; uploader_id: string; created_at: string; expires_at?: string;
}

// Extraction API available (from lib/extraction/ai.ts):
export async function condenseExtractedNotes(fullMarkdown: string, syllabusTopics: string[]): Promise<CondensationResult>
// CondensationResult returns { digest_chunks: [...], verbatim_chunks: [...] }

// Embedding API available:
export async function generateBatchEmbeddings(texts: string[]): Promise<number[][]>
```

## BLOCK 1: `getSubjectTopics`
- **Output:** `Promise<string[]>` array of topic names.
- **Business Logic:** 
  - Query table `topics` where `subject_id` equals the input.
  - Return an array of the `name` column values.
  - Handle error by returning an empty array `[]`.

## BLOCK 2: The Pipeline Replacement (Steps 4-7)
Replace the existing chunking block with the following logic.
**Available Scope Variables:**
`metadataId`, `jobId`, `subjectId`, `collegeId`, `originalFilename`, `fileType`, `teacherName`, `docSummary`, `diagramUrls`, `extractedText`, `now` (Date string), `collegeName`, `subjectName`.

**Business Logic for the Block:**
1. Call `getSubjectTopics(subjectId, getSupabaseAdmin())` to get topics.
2. Call `condenseExtractedNotes(extractedText, syllabusTopics)` to get the `condensation` result.
3. Calculate total chunks (`digest_chunks.length + verbatim_chunks.length`). Throw error if 0.
4. Extract all text contents from both chunk arrays into a flat array of strings.
5. Generate embeddings using `generateBatchEmbeddings(chunkTexts)`.
6. Map both `digest_chunks` and `verbatim_chunks` into a single flat `qdrantPoints: UpsertChunkInput[]` array.
7. For digest chunks, set `chunk_tier: 'digest'`, copy `teacher_emphasis`, `matched_syllabus_topics`, `source_page_range`, and `section_context` (from `section_title`).
8. For verbatim chunks, set `chunk_tier: 'verbatim'`, copy `verbatim_type`, `matched_syllabus_topics`, `source_page_range`, and `section_context` (from `section_title`).
9. For both, populate the legacy fields: `topic_tags` (use matched topics), `file_summary` (from `docSummary.summary`), `key_topics` (from `docSummary.topics`), `diagram_urls` (if any). Use a running `chunk_index` counter for all chunks.

## EXPECTED OUTPUT FORMAT
Write ONLY the function `getSubjectTopics` and the raw JavaScript/TypeScript code block for the main pipeline (no surrounding function wrapper for Block 2, just the code that will drop into the existing function body). Do not include imports.
