# Technical Implementation Plan: Scoping compute-a Upserts

## 1. Objective
Modify the `compute-a` pipeline so that the `topic_a_scores` table only contains rows for topics within the currently defined exam scope(s). This prevents out-of-scope topics from appearing in the ETSM fusion engine with a default score of 0, which currently inflates the topic pool.

## 2. Architecture & Root Cause
- **Root Cause:** `trigger/tasks/compute-a.ts` fetches all topics for a subject and passes them to `computeA`. The function in `lib/a/compute.ts` then iterates over every topic to create a result row, even if the scope gate skipped that topic's link processing.
- **Target Behavior:** The `topic_a_scores` table should only store rows for topics that are "in scope" (union of all scoped topics across active exam types).

## 3. Phase 1: Update Library Logic (lib/a/compute.ts)
Update the `computeA` function to accept an optional filter for allowed topic IDs.

- **File:** `file:///c:/Users/Ammar/Desktop/LastDayLLM/lib/a/compute.ts`
- **Changes:**
    - Update function signature to: `export function computeA(..., allowedTopicIds?: Set<string>): AResult[]`.
    - At the start of the function, define `effectiveTopics`:
        - If `allowedTopicIds` is provided and has size > 0, filter the input `topics` array.
        - Otherwise, use the full `topics` array (to maintain backward compatibility/default behavior).
    - Update the `topicAssignments` initialization loop and the final `results` mapping to use `effectiveTopics` instead of the raw `topics` input.
- **Done Criteria:** The function only returns `AResult` objects for topics present in the `allowedTopicIds` set (when provided).

## 4. Phase 2: Update Trigger Task (trigger/tasks/compute-a.ts)
Extract the active scope and pass it to the library.

- **File:** `file:///c:/Users/Ammar/Desktop/LastDayLLM/trigger/tasks/compute-a.ts`
- **Changes:**
    - After `expandedScopedTopics` is calculated (around line 183):
        - Iterate through `expandedScopedTopics.values()` (the Sets of topic IDs).
        - Flatten these into a single `Set<string>` named `allowedTopicIds`.
    - **Edge Case Handle:** If `expandedScopedTopics` is empty (meaning the user has no exam scope defined), `allowedTopicIds` should be `undefined` so that `computeA` defaults to processing all topics.
    - Pass `allowedTopicIds` as the 6th argument to the `computeA` call.
- **Done Criteria:** The task runs successfully and `topic_a_scores` only contains rows for the scoped topics.

## 5. Constraints
- Do not modify `lib/shared/exam-scope.ts`.
- Do not modify `trigger/tasks/compute-sp.ts` (it already handles scoping at the fetch level).
- Ensure the 6th argument to `computeA` remains optional.
- If no scope exists, the system must not crash or output zero rows; it must fall back to the original behavior (all topics).
