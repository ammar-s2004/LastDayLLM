# Notes Pipeline — End-to-End Readiness Report
**Date**: 2026-05-07  
**Verdict**: ✅ PRODUCTION READY — 1 advisory flag (non-blocking)

---

## Pipeline Flow (Verified)

```
PDF Upload (client)
  ↓
process-notes-qdrant.ts  [Trigger.dev task]
  ↓ downloadFile() / uploadToGoogleFileAPI()
  ↓ getSubjectHierarchy()         → Supabase: modules + topics → SyllabusHierarchy[]
  ↓ extractNotesIntel()           → lib/extraction/ai.ts
      ↓ buildNotesIntelPrompt()   → lib/ai-prompts.ts
      ↓ Gemini API call
          responseMimeType: 'application/json'  ✅
          responseSchema: { strict shape }      ✅ (NEW)
      ↓ JSON.parse() → RawNotesIntelResult
      ↓ decodeNotesIntel()        → lib/extraction/notes-intel.ts
      ↓ → NotesIntelResult        ✅ (full keys restored, downstream unchanged)
  ↓
  ├─ RAG PATH
  │    ↓ concept_intel + verbatim + diagrams → NoteChunkPayload[]
  │    ↓ generateBatchEmbeddings()            → lib/embeddings/google.ts
  │    ↓ upsertNoteChunks()                   → lib/qdrant/operations.ts
  │    ✅ Qdrant vectors written
  │
  └─ NC SCORING PATH
       ↓ computeNCFileScores(topic_coverage, topic_map)  → lib/nc/compute.ts
       ↓ computeFileWeight(pageCount)
       ↓ topicLookup (normalize + match topic names)
       ↓ upsert → nc_scores          [onConflict: topic_id,note_file_id] ✅
       ↓ upsert → nc_topic_map       [onConflict: topic_id,note_file_id] ✅
  ↓
  handleDeduplication()  → is_best_collection flag
  updateMetadata()       → processing_status: COMPLETED
  ↓
  lib/etsm/collect.ts (signal fusion, called separately at prediction time)
       ↓ reads nc_scores
       ↓ best-score + spread bonus aggregation ✅
       ↓ → NC signal into TopicData.signals.NC
```

---

## File-by-File Check

| File | Status | Notes |
|------|--------|-------|
| `trigger/tasks/process-notes-qdrant.ts` | ✅ | Full pipeline orchestration. Hierarchy fetch, upserts with onConflict, deduplication all correct. |
| `lib/extraction/ai.ts` | ✅ | `responseSchema` enforced. `NO_THINKING_CONFIG` applied. Decoder called correctly. |
| `lib/extraction/notes-intel.ts` | ✅ | `RawNotesIntelResult` interface clean. `decodeNotesIntel()` maps all 5 arrays correctly. |
| `lib/ai-prompts.ts` | ✅ | `SyllabusHierarchy` type exported. Prompt has calibration examples, rubric bands, strict instructions. Redundant schema text block removed. |
| `lib/nc/compute.ts` | ✅ | Graduated penalty (0.6x / 0.8x stepped). Emphasis `0.55 md + 0.45 eh`. Richness formula correct. `NCFileResult` interface unchanged. |
| `lib/nc/index.ts` | ✅ | Clean re-export of `compute.ts`. No dead exports. |
| `lib/etsm/collect.ts` | ✅ | Best-score + spread bonus. Guard `bestScore > 0.4` prevents shallow inflation. `ncMap` feeds correctly into `TopicData.signals.NC`. |
| `lib/embeddings/google.ts` | ✅ | Batched in groups of 100, L2 normalized, 768-dim. Handles empty input gracefully. |
| `lib/qdrant/types.ts` | ✅ | `NoteChunkPayload` supports all three tiers: `concept_intel`, `verbatim`, `diagram`. All fields used in the pipeline are present. |
| `lib/ai-limits.ts` | ✅ | `GEMINI_MODEL_NOTES = "gemini-3.1-flash-lite-preview"`. `NO_THINKING_CONFIG` uses `ThinkingLevel.MINIMAL` (correct for 3.x). |

---

## What Was Verified as Correct

**Idempotency** — both `nc_scores` and `nc_topic_map` use upsert with `onConflict: 'topic_id,note_file_id'`. Re-running the pipeline on the same file is safe.

**Type Safety** — `tsc --noEmit` exits 0. No implicit any leaks in the critical path.

**Schema Enforcement** — Gemini is now doubly constrained: `responseMimeType: 'application/json'` (valid JSON) + `responseSchema` (correct shape). A malformed AI response will fail fast at the API level, not silently deep in the pipeline.

**Decoder Correctness** — Every field in `RawNotesIntelResult` maps to the corresponding field in `NotesIntelResult`. The `hf` key (has_definition) correctly decodes to `has_definition`. No field is swapped or dropped.

**NC Signal Isolation** — `lib/nc/index.ts` exports only `computeNCFileScores` and `computeFileWeight`. No aggregate.ts was created. The fusion engine reads directly from `nc_scores` via `collect.ts`.

**Qdrant Chunk Tiers** — All three chunk types (`concept_intel`, `verbatim`, `diagram`) are mapped to distinct `chunk_tier` values and stored with correct payload fields.

---

## Advisory Flag (Non-Blocking)

> **Flag**: `flatTopicNames` is computed in `getSubjectHierarchy()` but never used anywhere in the task.

**Location**: `process-notes-qdrant.ts` line 152 + line 298 (`const { hierarchy, flatTopicNames }`)

**Risk**: Zero functional impact. `flatTopicNames` is destructured but never passed to anything. TypeScript does not error on unused destructured variables.

**Recommendation**: Either remove `flatTopicNames` from the return type and call site (clean), or leave it as a scaffold for future use (e.g., fuzzy topic matching fallback). Not urgent.

---

## Summary

The pipeline is end-to-end coherent. Every stage hands off the correct shape to the next. Both DB writes are idempotent. The AI extraction is structurally enforced. The NC scoring formula and aggregation logic are exactly as designed. TypeScript compiles clean.

**Ready to deploy.**
