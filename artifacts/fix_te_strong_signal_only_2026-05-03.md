# TE Calibration: Strong Signal Only
Date: 2026-05-03

## Objective
TE should only influence fusion when a teacher explicitly and strongly emphasized a topic. The current rubric allows partial/indirect mentions (0.3–0.6) to carry fusion weight, polluting the signal. Three targeted changes fix this — the TE prompt is also migrated into the central prompt store (`lib/ai-prompts.ts`) where all other prompts live.

---

## Change 1 — `lib/te/prompt.ts`

**Target:** `buildTEPrompt` function, lines 18–22 (the rubric block inside the template literal).

**Replace this rubric:**
```
For each topic, assign an emphasis_score from 0.0 to 1.0:
- 1.0 = teacher explicitly and strongly emphasized this
- 0.7-0.9 = strongly implied or related to something explicitly mentioned
- 0.3-0.6 = partially related, indirect mention
- 0.0-0.2 = not mentioned at all, no connection to hints
```

**With this rubric:**
```
For each topic, assign an emphasis_score from 0.0 to 1.0:
- 0.9-1.0 = teacher explicitly and directly emphasized this topic (direct quote, named topic, or strong verbal emphasis)
- 0.7-0.8 = strongly implied — the topic is directly and unmistakably related to something explicitly mentioned
- 0.0 = everything else — indirect mention, partial relevance, tangential, or not mentioned at all

Do NOT use scores between 0.1 and 0.6. There is no middle ground. If a topic was not directly or strongly implied, score it 0.0.
```

**Also replace line 16:**
```
// BEFORE:
Your job is to distribute emphasis across all topics based on the hints.

// AFTER:
Your job is to identify which topics the teacher explicitly emphasized. Most topics should score 0.0. Only score a topic above 0.0 if the teacher directly mentioned or clearly implied it.
```

**Do not touch:** Function signature, topic/hint injection lines (~42–46), JSON format block (~31–40). The `EnrichedTopic` interface stays in `lib/te/prompt.ts` (or moves with the function — see Change 3).

---

## Change 2 — `lib/etsm/engine.ts`

**Target:** `scoreTopic` method, lines 47–85.

**Exact insertion point:** After line 51 (`let baseScore = 0;`) and before the existing `for` loop at line 54.

**Add a constant and build effective weights that exclude TE when it's below threshold:**

Add at the top of the `scoreTopic` method body (after `let baseScore = 0;`):

```
Define a constant TE_STRONG_THRESHOLD = 0.7.

Create a new local variable `effectiveWeights` as a shallow copy of `weights`.

If `ctx.has_hints` is true AND `topic.signals.TE` is less than `TE_STRONG_THRESHOLD`:
  - Delete the TE key from `effectiveWeights`.
  - Re-normalize effectiveWeights so they sum to 1:
    - Compute total = sum of all remaining values in effectiveWeights (skip undefined).
    - If total > 0, divide every value in effectiveWeights by total.

From this point on, replace ALL references to `weights` inside this method with `effectiveWeights`.
```

**Specifically:**
- Line 54 loop iterating over `weights` for `baseScore` → use `effectiveWeights`
- Line 64 loop iterating over `weights` for `strongCount` → use `effectiveWeights`
- The `teacherFloor` line (~72) reads `topic.signals.TE` directly — do NOT change it, it should still fire based on raw signal value

**Do NOT touch:** `buildActiveWeights`, `rankModule`, `types.ts`, `collect.ts`, `trigger/tasks/run-prediction.ts`, or any other file.

---

## Change 3 — Migrate `buildTEPrompt` to `lib/ai-prompts.ts`

**Goal:** All AI prompts live in `lib/ai-prompts.ts` (see `buildSPPrompt`, `buildNotesIntelPrompt`, etc.). `buildTEPrompt` is currently in `lib/te/prompt.ts` — move it to the central store.

**Step A — `lib/ai-prompts.ts`:**
- Add the `EnrichedTopic` interface export (copy it from `lib/te/prompt.ts`) at the bottom of `lib/ai-prompts.ts`.
- Add the `buildTEPrompt` function (with the updated rubric from Change 1) as a new export at the bottom of `lib/ai-prompts.ts`. Add a section header comment above it matching the pattern of other sections in that file:
  ```
  // =============================================================================
  // TE (TEACHER EMPHASIS) PROMPT
  // =============================================================================
  ```

**Step B — `lib/te/prompt.ts`:**
- Delete the `EnrichedTopic` interface and `buildTEPrompt` function from this file entirely.
- The file will be empty after removal. Delete the file if it becomes empty, OR leave it exporting nothing — Codex's choice. Do not break `lib/te/index.ts`'s `export * from "./prompt"` if the file is kept; if deleting the file, remove the export line from `lib/te/index.ts`.

**Step C — `trigger/tasks/compute-te.ts`:**
- Line 9: Remove `buildTEPrompt` from the `@/lib/te` import.
- Add a new import line: `import { buildTEPrompt, type EnrichedTopic } from "@/lib/ai-prompts";`
- If `EnrichedTopic` was already imported from `@/lib/te`, remove it from there and import from `@/lib/ai-prompts` instead.
- Do not touch any other logic in this file.

---

## Done Criteria
1. `lib/te/prompt.ts` rubric no longer mentions 0.3–0.6 range
2. `lib/te/prompt.ts` explicitly instructs LLM that most scores should be 0.0 (OR prompt has been moved to `lib/ai-prompts.ts` with the updated rubric)
3. `lib/ai-prompts.ts` exports `buildTEPrompt` and `EnrichedTopic` with the new rubric
4. `trigger/tasks/compute-te.ts` imports `buildTEPrompt` from `@/lib/ai-prompts`
5. `lib/etsm/engine.ts` `scoreTopic` has `TE_STRONG_THRESHOLD = 0.7` constant
6. `scoreTopic` re-normalizes weights when TE is dropped for a topic
7. `teacherFloor` logic is unchanged
8. TypeScript compiles with no errors
9. No other files modified
