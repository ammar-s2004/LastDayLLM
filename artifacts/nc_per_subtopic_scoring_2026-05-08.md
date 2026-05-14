# NC Per-Subtopic Scoring Migration
**Date:** 2026-05-08
**Objective:** Migrate the Notes Coverage (NC) signal to evaluate and score directly at the leaf node (subtopic) level to achieve perfect universality with the ETSM ranking engine.

## Architecture & Data Flow Changes

Currently, the AI evaluates Notes Coverage (NC) at the **parent topic level**. Our recent hotfix simply took that parent score and duplicated it across all child subtopics. 

**The new architecture:**
1. The AI will evaluate coverage density, depth, and pedagogical richness directly on the **subtopic level**.
2. If a parent topic has no children (leaf parent), the AI will evaluate the parent.
3. The "Missing Sibling Penalty" in `computeNCFileScores` will be removed. Since we are evaluating at the subtopic level, if a subtopic is missing from the notes, the AI simply won't return a coverage object for it (Score = 0). We no longer need to penalize a well-explained subtopic just because its sibling was skipped.
4. The `process-notes-qdrant.ts` job will map the AI's subtopic score directly to the exact child `topic_id` in the database.

---

## Phase 1: Update AI Prompt Constraints
**Goal:** Instruct the AI to output subtopic identifiers for `topic_coverage`.
**Target File:** `lib/ai-prompts.ts`

**Implementation Details:**
- Locate the `topic_coverage` (tc) section in the `NOTES_RAG_ANSWER_PROMPT` (or rather the extraction prompt `buildNotesIntelPrompt` / the prompt block).
- Update the schema instructions for `tc` to require both `t` (exact parent topic name) and `st` (exact subtopic name).
- Add the critical rule: *"If a topic has no sub_topics, use the parent topic name for BOTH t and st."* This handles leaf parents.

---

## Phase 2: Update Type Definitions & Decoder
**Goal:** Expand the Zod/TypeScript schemas to accept the new `st` field.
**Target File:** `lib/extraction/notes-intel.ts`

**Implementation Details:**
- In `RawNotesIntelResult.tc`, add `st: string;`
- In `NotesIntelResult.topic_coverage`, add `subtopic: string;`
- In the `decodeNotesIntel` function, ensure `st` is mapped to `subtopic` when mapping `raw.tc`.

---

## Phase 3: Refactor NC Compute Logic
**Goal:** Calculate the final `nc_file_score` per subtopic and remove deprecated penalties.
**Target File:** `lib/nc/compute.ts`

**Implementation Details:**
- Update `NCFileResult` interface: replace `topic` with `topic` and `subtopic`.
- In `computeNCFileScores`:
  - Remove the `topicMap` parameter entirely (it is no longer needed).
  - Remove all logic related to `notCoveredPenaltyApplied` and `missRatio`.
  - The function should just take `topicCoverage`, map over it, calculate the richness/emphasis score, and return the `topic` and `subtopic` alongside the score.
  - Update the `depth_breakdown` return object to reflect the removal of `notCoveredPenaltyApplied`.

---

## Phase 4: Wire to Database Leaf Nodes
**Goal:** Map the per-subtopic NC scores to the exact child DB rows in the background job.
**Target File:** `trigger/tasks/process-notes-qdrant.ts`

**Implementation Details:**
- Locate the section where `ncScoreRows` are generated (around line 460).
- The `topicLookup` currently maps normalized parent names to the parent DB row.
- `childrenByParent` currently maps parent IDs to an array of `{ id, module_id }`.
- **Change needed:** Update `childrenByParent` to also include the `name` of the child row (`{ id, module_id, name }`).
- When iterating over `ncFileResults`:
  - Look up the parent using `result.topic`.
  - Fetch its children from `childrenByParent`.
  - Find the specific child where `normalizeTopicName(child.name) === normalizeTopicName(result.subtopic)`.
  - If a specific child is found, write the `nc_file_score` to that child's `topic_id`.
  - If no children exist (leaf parent), write the score to the parent's `topic_id`.
  - Remove the previous hotfix logic that mapped the score to *all* children indiscriminately.
- Ensure the `upsert` to the `nc_scores` table remains clean.

---

## Execution Interface
**Inputs:** None.
**Outputs:** Subtopics accurately scored in `nc_scores` table.
**State:** Ready for Codex.
