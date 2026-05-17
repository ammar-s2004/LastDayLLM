# CODEX PLAN — Question Generation Module: Phase 3 Backend Engine
**Date:** 2026-05-15  
**Phase:** 3 of 5  
**Scope:** Trigger.dev background task, Supabase migration for answer_text, AI Prompt definition, API Route.

---

## 1. SUPABASE MIGRATION (✅ COMPLETED BY OPUS)

The `answer_text` column has been successfully added to `public.generated_questions`. You do **not** need to perform any migrations.

---

## 2. AI PROMPT (`lib/ai-prompts.ts`)

Add the following prompt builder function and interface to `lib/ai-prompts.ts`.

```typescript
// =============================================================================
// QUESTION GENERATION PROMPT
// =============================================================================

export interface QuestionGenerationInput {
  moduleName: string;
  topicsWithScores: { name: string; band: "HIGH" | "MEDIUM" | "LOW"; final_score: number }[];
  examScopeTopics: string[];
  pyqs: string[];
  assignmentQuestions: string[];
  teacherHints: string;
  paperPattern: string;
}

export function buildQuestionGenerationPrompt(input: QuestionGenerationInput): string {
  return \`You are an expert college professor designing a high-stakes exam question bank.
Your task is to generate exam questions for the module: "\${input.moduleName}".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW THIS DATA WAS GENERATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The topic scores below were produced by the ETSM (Exam Topic Scoring Model) algorithm.
ETSM evaluates each topic across 5 weighted signals:

- SP  (Syllabus Prominence):   How centrally and repeatedly the topic appears in the syllabus structure. High SP = core concept.
- NC  (Notes Coverage):        How thoroughly the student's uploaded notes cover this topic. High NC = well-documented.
- WTF (Weighted Test Frequency): How often this topic has appeared in past year question papers, weighted by recency. High WTF = examiner favourite.
- TE  (Teacher Emphasis):      Direct signal from teacher hints — explicit warnings, "this will come", repeated emphasis. Overrides other signals when strong.
- A   (Assignment Signal):     How heavily this topic was tested in assignments and internal assessments. High A = teacher invested time here.

All signals are normalized and fused into a final_score (0–1). The band (HIGH/MEDIUM/LOW) is the tier cutoff.
Use this matrix as your primary prioritization guide.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATA PROVIDED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. ETSM Prediction Matrix:
\${JSON.stringify(input.topicsWithScores, null, 2)}

2. Confirmed Exam Scope Topics:
\${input.examScopeTopics.join(", ") || "None specified"}

3. Past Year Questions (PYQs):
\${input.pyqs.join("\\n") || "None provided"}

4. Assignment Questions:
\${input.assignmentQuestions.join("\\n") || "None provided"}

5. Teacher Hints:
\${input.teacherHints || "None provided"}

6. Paper Pattern:
\${input.paperPattern || "None provided"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OBJECTIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generate a question bank where a student targeting 90+ marks can study efficiently based on how much time they have.

Think like the professor who set this paper. You have already seen what topics they care about (ETSM), how they phrased questions before (PYQs), what they invested class time in (assignments), and what they explicitly warned students about (teacher hints). Use all of that to reason about what will come — not just what could come.

QUANTITY RULES:
- Do NOT generate a fixed number. Generate the RIGHT number.
- Tag 1 (3H) questions should be the absolute minimum — typically 3 to 6 per module. If you have more than 6 Tag 1 questions, you are not being selective enough.
- Tag 2 (8H) adds moderately — typically 4 to 8 additional questions on top of Tag 1.
- Tag 3 (2D) fills everything else — aim for full syllabus coverage, but only ask what a professor would realistically set.
- Total questions per module: typically 12 to 20. Never exceed 25. Never go below 8.
- Do not pad. If a topic is minor and low-signal, one good question covers it. Do not manufacture 3 questions just to seem thorough.
- Every question must be genuinely likely to appear on a real exam, or genuinely important for understanding.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STUDY MODE TAGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tag every question with an integer study_mode_tag (1, 2, or 3):

- 1 (3H — Crunch Mode):   Minimum viable set to score 90+. Highest-confidence, highest-yield only. A student with 3 hours studies exactly these.
- 2 (8H — Focused Mode):  Adds important supporting questions on top of Tag 1.
- 3 (2D — Full Coverage): Complete syllabus — no blind spots, built for full marks.

Tag 1 questions are always shown in Tag 2 and Tag 3 views.
Tag 2 questions are always shown in Tag 3 views.

Generate enough questions so the Tag 3 set genuinely covers everything. But be selective — do not pad. Every question must earn its place.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return a JSON array only. No preamble, no markdown fences.

[
  {
    "question_no": 1,
    "question_text": "...",
    "answer_text": "...",
    "question_type": "THEORY | NUMERICAL | APPLICATION | DEFINITION",
    "probability": "HIGH | MEDIUM | LOW",
    "study_mode_tag": 1 | 2 | 3,
    "estimated_marks": 2 | 5 | 10,
    "source_topics": ["exact topic name from prediction matrix"]
  }
]
\`;
}
```

---

## 3. TRIGGER.DEV TASK (`trigger/tasks/generate-questions.ts`)

Create a new file `trigger/tasks/generate-questions.ts`.

### Logic Flow:
1. **Inputs:** `subjectId: string`, `userId: string`, `moduleId: string`, `predictionRunId: string`. (The UI will trigger this per-module to keep context sizes manageable and parallelize generation).
2. **Fetch Data:**
   - Fetch the module and its topics from Supabase.
   - Fetch `prediction_topic_scores` for this `predictionRunId` to get the importance of each topic.
   - Fetch `subject` details including `examScopeTopicIds`.
   - Fetch `teacher_hints` for this `subjectId`.
   - Fetch PYQs and Assignment Questions for this `subjectId` / `moduleId`.
3. **Generate via LLM:**
   - Construct a prompt string combining `QUESTION_GENERATION_PROMPT` and the injected data (Topics, Exam Scope, PYQs, Assignments, Hints, Pattern).
   - Use the `@google/genai` client (with `gemini-3.1-flash` or the equivalent configured in your env, see `process-syllabus.ts` for the exact client usage).
   - Use `responseSchema` to enforce the JSON structure.
4. **Save to Database:**
   - Delete any existing `generated_questions` for this `module_id` and `prediction_run_id` to ensure idempotency.
   - Insert the new questions into `generated_questions`. Set `ai_model` to `'gemini-3.1-flash'`.

### Example Structure:
```typescript
import { task, logger } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";
// Import Google GenAI and your Qdrant client

// ... getSupabaseAdmin() ...

export const generateQuestionsTask = task({
  id: "generate-questions",
  retry: { maxAttempts: 3 },
  run: async (payload: { subjectId: string; userId: string; moduleId: string; predictionRunId: string }) => {
    // 1. Setup Supabase
    // 2. Fetch Module, Topics, Scores, Hints, PYQs, Assignments
    // 3. Call buildQuestionGenerationPrompt() from lib/ai-prompts.ts
    // 4. Call Gemini 3.1 Flash with responseSchema
    // 5. Delete existing questions for this module+prediction_run, then Insert new ones
  }
});
```
*(Make sure to export `generateQuestionsTask` in `trigger/index.ts`!)*

---

## 4. API ROUTE (`app/api/generate-questions/route.ts`)

Create the endpoint that the frontend will call.

1. Takes POST request with `subjectId`, `predictionRunId`.
2. Validates user session.
3. Fetches all `modules` for the given `subjectId`.
4. Triggers the `generateQuestionsTask` in parallel for each module using `tasks.batchTrigger`.
5. Returns success status.

Example structure:
```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { tasks } from '@trigger.dev/sdk/v3'
import type { generateQuestionsTask } from '@/trigger/tasks/generate-questions'

export async function POST(req: Request) {
  // 1. Auth check
  // 2. Extract body
  // 3. Get modules
  // 4. tasks.batchTrigger<typeof generateQuestionsTask>("generate-questions", [ ...payloads ])
  // 5. Return success
}
```

---

## DONE CRITERIA

1. Supabase migration applied successfully adding `answer_text`. ✅ DONE
2. `buildQuestionGenerationPrompt` added to `lib/ai-prompts.ts`. ✅ DONE
3. `trigger/tasks/generate-questions.ts` created, exported in `trigger/index.ts`, fetches data, calls `buildQuestionGenerationPrompt`, calls Gemini 3.1 Flash with `responseSchema`, and inserts into `generated_questions`.
4. `app/api/generate-questions/route.ts` created to batch-trigger the task per-module.
5. TypeScript builds without errors.
