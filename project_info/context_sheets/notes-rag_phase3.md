# Context Sheet: Single-Pass Notes RAG — Phase 3/4

## WHAT TO WRITE
Target file: `trigger/tasks/process-notes-qdrant.ts` (existing Trigger.dev v4 task).
Rewrite the `run()` function body of `processNotesQdrantTask` to use the new `SinglePassResult` flow instead of the legacy `extractTextWithAI` flow.

## INPUTS & OUTPUTS
Input payload:
```typescript
{
    metadataId: string;
    collegeId: string;
    subjectId: string;
    storagePath: string;
    googleFileUri?: string | null;  // <--- Check this first! (From Phase 0)
    googleFileName?: string | null; // <--- Target for cleanup
    originalFilename: string;
    fileType: string;
    teacherName: string | null;
}
```

## BUSINESS LOGIC & EDGE CASES (The Flow)

1. Initialization & Download
   - Set task status to PROCESSING in `updateMetadata` & `updateProgress` (init stage).
   - If `googleFileUri` is passed in the payload, skip download. If missing, download the file from Supabase `downloadFile(storagePath)`.
   
2. Upload to Google (Fallback ONLY if needed)
   - If `googleFileUri` is present, it means the parallel upload in the API succeeded. Use it.
   - If `googleFileUri` is NULL, you MUST call `uploadToGoogleFileAPI(buffer, mimeType, originalFilename)` to get a `uri` and `name`. (Buffer comes from step 1 download).
   
3. AI Condensation (The Core Change)
   - Update progress: "🧠 AI processing document..."
   - Get topics: `const syllabusTopics = await getSubjectTopics(...)`
   - If PDF is small, or if it's PPTX, call `condenseFileDirectly(fileUri, mimeType, syllabusTopics)`
   - ONLY if it's a huge PDF without a pre-existing `fileUri` do you need `condensePDFWithSegmentation` (but for simplicity, just try `condenseFileDirectly` first; if it throws a size error, catch it, download the buffer if you haven't, and run `condensePDFWithSegmentation(buffer, originalFilename, syllabusTopics)`).
   - Alternatively, you can just use `condenseFileDirectly` for everything that has a `fileUri`, assuming the API handled it. To be safe, just use `condenseFileDirectly` if `googleFileUri` is present. If it fails due to size, fall back to downloading and using `condensePDFWithSegmentation`.

4. PPTX Images (Parallelize)
   - If `fileType` is PPTX, you MUST still call `extractPPTXImages` and `uploadDiagramsToSupabase`.
   - Wait: The returned array of `diagramUrls` only gets injected into `qdrantPoints` context now, we no longer string-replace into raw text because raw text doesn't exist! Just save `diagramUrls` for Qdrant payload mapping.

5. Qdrant Mapping
   - Map `digest_chunks` and `verbatim_chunks` from the `SinglePassResult` into `qdrantPoints`.
   - Use `doc_summary` and `key_topics` from `SinglePassResult` on EVERY point payload.
   
6. Embeddings
   - Call `generateBatchEmbeddings` on the chunk contents, attach them to the Qdrant points.
   
7. Finish
   - Call `upsertNoteChunks`
   - Call `handleDeduplication`
   - Call `updateMetadata` with `doc_summary` and `key_topics`.
   - Update final progress.

8. Cleanup (CRITICAL `finally` block or end of execution)
   - You MUST delete the file from Google File API using `deleteGoogleFile`.
   - If you used `payload.googleFileName`, delete that.
   - If you uploaded a fallback file, delete that name.

## DO NOT
- Do not import missing tools. Use existing helper functions already in the file.
- Do not hallucinate `Trigger.dev` syntax. Just return the modified `run()` function body.
