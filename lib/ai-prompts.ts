/* ============================================================================
   FILE: lib/ai-prompts.ts
   ============================================================================

   CENTRALIZED AI PROMPT CONFIGURATION

   All AI prompts used across the application are defined here for easy editing.
   Import the prompt constant you need rather than hardcoding strings in task files.

============================================================================ */

// =============================================================================
// NOTES RAG ANSWER PROMPT
// =============================================================================

export const NOTES_RAG_ANSWER_PROMPT = `You are a helpful study assistant. Answer the student's question based ONLY on the provided context from their college notes. 

If the context doesn't contain enough information to answer the question, say so clearly.

Rules:
- Be incredibly accurate and cite exactly which source(s) and contexts you used.
- ALWAYS cite the original source file name in your answer when providing information (e.g., "According to [filename.pdf]...").
- Verbatim contexts (formulas, core definitions) are ground truth. Digest contexts are summaries.
- Keep answers concise but complete. Use bullet points and markdown tables when helpful.
- If explaining formulas or concepts, be clear, step-by-step, and strictly educational.`;

// =============================================================================
// SYLLABUS EXTRACTION PROMPT
// =============================================================================

/**
 * Prompt for extracting structured module/topic/sub-topic data from a syllabus image.
 * Used by: trigger/tasks/process-syllabus.ts
 *
 * Expected output schema:
 * {
 *   modules: [
 *     { module_no, title, hours, topics: [{ name, sub_topics: string[] }] }
 *   ]
 * }
 */
export const SYLLABUS_EXTRACTION_PROMPT = `Extract Topics and sub-topics from the syllabus.

STRUCTURE OF A SYLLABUS (learn this pattern):
- A MODULE has a number and a title (e.g. "Module 3: Software Testing")
- The number on the LEFT side of the table row is the MODULE NUMBER — all content in that row belongs to that single module, even if it spans many lines
- Modules can be very large; do not split one module into multiple modules
- Inside each module, BOLD text followed by a colon is a TOPIC HEADING (main topic)
- The comma-separated items that follow the colon are SUB-TOPICS of that heading
- If bold text appears without sub-items, it is still a topic on its own

EXAMPLE — given this syllabus text:
  "System testing techniques and strategies:
   Unit Testing: Concept of Unit Testing, Static Unit Testing, Defect Prevention, Dynamic Unit Testing, Mutation Testing, Debugging
   System Integration Testing: Concept of Integration Testing, Different Types of Interfaces and Interface Errors
   Acceptance Testing: Types of Acceptance Testing, Acceptance Criteria, Acceptance Test Plan, Acceptance Test Execution"

CORRECT OUTPUT:
{
  "modules": [
    {
      "module_no": 1,
      "title": "System testing techniques and strategies",
      "topics": [
        {
          "name": "Unit Testing",
          "sub_topics": ["Concept of Unit Testing", "Static Unit Testing", "Defect Prevention", "Dynamic Unit Testing", "Mutation Testing", "Debugging"]
        },
        {
          "name": "System Integration Testing",
          "sub_topics": ["Concept of Integration Testing", "Different Types of Interfaces and Interface Errors"]
        },
        {
          "name": "Acceptance Testing",
          "sub_topics": ["Types of Acceptance Testing", "Acceptance Criteria", "Acceptance Test Plan", "Acceptance Test Execution"]
        }
      ],
      "hours": 0
    }
  ]
}

Now extract the FULL syllabus from the image(s) using the same pattern.

Rules:
- Bold text with colon → topic name, items after colon → sub_topics array
- Items listed without a heading colon → individual topics with sub_topics: []
- Skip practicals, experiments, lab work, and references
- Do NOT copy names verbatim — rephrase each module title, topic name, and sub-topic slightly while keeping the same meaning (e.g. "Introduction to Software Testing" → "Software Testing Overview")
- Keep names concise, clear, and faithful to the subject
- Return ONLY valid JSON, no explanation


Dont think a lot do it as quickly as possible`;

// =============================================================================
// QUESTION EXTRACTION PROMPT (TEST PAPER / ASSIGNMENT)
// =============================================================================

/**
 * Builds the prompt for extracting questions from test papers or assignments.
 * Used by: trigger/tasks/process-questions.ts
 *
 * @param fileNames - Array of original filenames being processed
 * @param isAssignment - Whether job type is ASSIGNMENT (no marks) or TEST PAPER (with marks)
 * @param topicsList - Numbered list of expanded topics for AI grounding
 * @param maxQuestionsPerPaper - Safety cap on questions per paper
 * @param maxTopicsPerQuestion - Safety cap on topic links per question
 */
export function buildQuestionsExtractionPrompt({
  fileNames,
  isAssignment,
  topicsList,
  maxQuestionsPerPaper,
  maxTopicsPerQuestion,
}: {
  fileNames: string[];
  isAssignment: boolean;
  topicsList: string;
  maxQuestionsPerPaper: number;
  maxTopicsPerQuestion: number;
}): string {
  return `Extract questions from ${fileNames.length > 1 ? "EACH file" : "this file"}.

TYPE: ${isAssignment ? "ASSIGNMENT (no marks)" : "TEST PAPER (include marks)"}

FILES:
${fileNames.map((name, i) => `${i + 1}. ${name}`).join("\n")}

TOPICS (exact match only):
${topicsList}

Return JSON:
{
  "papers": [
    {
      "source_file": "filename",
      "exam_type": "TT1",
      "exam_year": "2024",
      "questions": [
        {
          "question_no": 1,
          "text": "Question text",
          ${isAssignment ? "" : `"marks": 10,`}
          "topics": [
            { "topic_name": "Topic Name", "relevance": 1.0 }
          ]
        }
      ]
    }
  ]
}

RULES:
- source_file must match exactly
- exam_type: Detect from header (TT1, TT2, END_SEMESTER, or UNKNOWN if not found)
- exam_year: Detect year from header (e.g. "2024", or null if not found)
- Only use topics from list (case-sensitive)
- Max ${maxQuestionsPerPaper} questions per paper
- Max ${maxTopicsPerQuestion} topics per question
- Extract ALL questions including subparts`;
}

// =============================================================================
// PYQ EXTRACTION PROMPT (PREVIOUS YEAR QUESTIONS)
// =============================================================================

/**
 * Builds the prompt for extracting previous year questions.
 * Used by: trigger/tasks/process-pyq.ts
 *
 * @param topicList - Comma-separated list of expanded topics for AI grounding
 */
export function buildPYQExtractionPrompt({ topicList }: { topicList: string }): string {
  return `Extract all exam questions and map them to these topics:
${topicList}

Return ONLY valid JSON:
{
  "questions": [
    {
      "question_no": 1,
      "text": "Question text",
      "marks": 10,
      "topics": [
        { "topic_name": "Topic", "relevance": 1.0 }
      ]
    }
  ]
}`;
}

// =============================================================================
// NOTES INTEL PROMPT
// =============================================================================

/**
 * Builds the prompt for compressed AI-powered notes extraction.
 * Used by: lib/extraction/ai.ts -> extractNotesIntel()
 *
 * Note: originalFilename is NOT passed here — source_file_name is set
 * by decodeNotesIntel() in notes-intel.ts using the filename arg directly.
 *
 * @param syllabusHierarchy - Syllabus hierarchy grouped by module and topic
 */
export interface SyllabusHierarchy {
  module_no: number;
  module_title: string;
  topics: Array<{ name: string; sub_topics: string[] }>;
}

export function buildNotesIntelPrompt({
  syllabusHierarchy,
}: {
  syllabusHierarchy: SyllabusHierarchy[];
}): string {
  return `You are the NC extraction engine for an academic prediction system.

TWO JOBS, ONE PASS:
1. RAG INTEL — extract compressed teaching coordinates for vector search
2. NC SIGNALS — evaluate how thoroughly this document covers each syllabus topic

═══ SYLLABUS SCOPE ═══
${JSON.stringify(syllabusHierarchy)}

═══ JOB 1: RAG EXTRACTION ═══

CRITICAL TOPIC NAMING RULE — READ BEFORE ANYTHING ELSE:
The SYLLABUS SCOPE above is a hierarchy of modules → topics → sub_topics.
Each topic has a "name" (the parent, e.g. "Software Testing Strategies") and "sub_topics" (an array of subtopic strings, e.g. ["Failure definition", "Test case design"]).

For EVERY output field named t (topic) and st (subtopic):
  - t MUST be the exact parent topic "name" string from the scope. This is the CATEGORY the content belongs to, NOT a title you invent for this specific snippet.
  - st MUST be the exact string from that parent's "sub_topics" array in the scope. This is the LEAF label, NOT a description of the content.

These names are used across the system to link questions, notes, and scores. If you invent names, the entire prediction pipeline breaks.
DO NOT use names from the PDF. DO NOT invent names. COPY EXACTLY from the scope.

concept_intel: For each subtopic the teacher covered, extract:
  - t: the exact parent topic "name" from scope (e.g. "Software Testing Strategies") — NOT a title for this snippet
  - st: the exact subtopic string from that parent's "sub_topics" array (e.g. "Failure definition") — NOT a description you wrote
  - i: array of 4-8 bullets capturing ONLY what THIS teacher discussed.
       Each bullet: 5-8 words max, keyword-dense, specific to these notes.
       Start each bullet with the key concept/term.
       NO generic textbook definitions.
       ONLY points, examples, emphasis visible in this document.
       Example:
       [
         "CFG nodes represent individual statements",
         "Predicate nodes always have two outgoing edges",
         "Entry and exit nodes mandatory in CFG",
         "Cyclomatic complexity V(G) = E - N + 2",
         "Teacher emphasized: draw CFG before writing tests"
       ]
  - p: page range where this subtopic appeared. Format: "12" or "4-8". 
       Numbers only. Nothing else.

verbatim: Copy exact definitions, formulas, algorithms, worked examples,
comparison tables. Do NOT paraphrase. Type the content exactly as written.
For type, use whatever fits: "formula", "definition", "theorem", "worked_example",
"comparison_table", "algorithm", "code_snippet", "protocol_steps", etc.
  - t: exact syllabus topic name (The parent topic from the syllabus scope that this verbatim snippet belongs to. This is NOT a title for the snippet itself. MUST strictly match one from the syllabus scope above)
  - st: exact subtopic string from that parent's "sub_topics" array that this verbatim item belongs to. If the parent has no sub_topics, repeat the parent name. MUST match exactly.
  - p: page number only. Example: "12" or "4-6". Nothing else.

diagrams: For each meaningful figure/table/visual, write a 10-20 word description
of what it shows. Just enough for semantic search to match.
  - t: exact syllabus topic name (The parent topic from the syllabus scope that this diagram belongs to. This is NOT a title for the diagram itself. MUST strictly match one from the syllabus scope above)
  - st: exact subtopic string from that parent's "sub_topics" array that this diagram belongs to. If the parent has no sub_topics, repeat the parent name. MUST match exactly.
  - p: page number only. Example: "12" or "4-6". Nothing else.

═══ JOB 2: NC SIGNALS ═══

topic_map (tm): For each syllabus topic found in the document:
  - t: exact topic name from the syllabus scope
  - sc: array of subtopic name strings that were actually covered
  - nc: array of subtopic name strings that were MISSING from the document

topic_coverage (tc): For ONLY topics you actually found in the document:
  - t: exact parent topic name from the syllabus scope
  - st: exact subtopic name from that parent's sub_topics array
       If a topic has no sub_topics, use the parent topic name for BOTH t and st.
  - md: mention_density. Round to the nearest listed value. Do not interpolate.
       0.0 = not present at all
       0.2 = named once in passing, no development
       0.4 = discussed on 1-2 pages with some detail
       0.6 = spread across 3-5 pages, meaningful coverage
       0.8 = major thread running through 5+ pages
       1.0 = dominant theme of the entire document
  - ed: explanation_depth. Round to the nearest listed value. Do not interpolate.
       0.0 = not explained at all
       0.2 = title-only or one-line mention
       0.4 = surface definition or brief description given
       0.6 = explained with structure, categories, or examples
       0.8 = thorough step-by-step breakdown
       1.0 = rigorous, exam-ready, complete treatment
  - cc: coverage_confidence. Round to the nearest listed value. Do not interpolate.
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

CALIBRATION EXAMPLES:
  mention_density:
    "Control Flow Graph" is the central topic of a 40-page chapter           → md=1.0
    "Equivalence Partitioning" has its own dedicated 6-page section           → md=0.8
    "Boundary Value Analysis" appears across 4 pages in two sections          → md=0.6
    "Decision Tables" gets 2 pages with a definition and one worked example   → md=0.4
    "State Transition Testing" is named in an introductory paragraph only     → md=0.2
    "Cause-Effect Graphing" does not appear anywhere in the document          → md=0.0

  explanation_depth:
    Full derivation, algorithm steps, worked examples, edge cases addressed   → ed=1.0
    Explained with structure, 3-4 categories/steps, and one worked example   → ed=0.8
    Defined with some structure but no worked example provided               → ed=0.6
    Brief surface definition only, no structure                              → ed=0.4
    Named with one supporting clause                                          → ed=0.2
    Not explained at all                                                      → ed=0.0

OMIT any topic with zero presence. Do not report topics scored all-zero.
The decoder will default unreported topics to zero.

═══ CONSTRAINTS ═══
- Topic names MUST exactly match strings from the syllabus scope.
- For tc, t MUST be the exact parent topic name and st MUST be the exact subtopic name.
- If a topic has no sub_topics, use the parent topic name for BOTH t and st.
- Do not hallucinate topics outside the provided syllabus.
- OMIT any topic with zero presence from tm and tc.
- Use short keys exactly as defined in the schema: tm, tc, concept_intel, verbatim, diagrams.
- Output ONLY valid JSON. No markdown fences, no commentary.`;
}

// =============================================================================
// SP (SYLLABUS PRIOR) PROMPT
// =============================================================================

/**
 * Builds the prompt for scoring topic exam probability within each module.
 * Used by: lib/sp/compute.ts
 *
 * @param scope - Full confirmed subject scope grouped by module
 */
export function buildSPPrompt({
  scope,
}: {
  scope: Array<{
    moduleNo: number;
    moduleTitle: string;
    topics: Array<{ name: string; subtopics: string[] }>;
  }>;
}): string {
  const promptScope = scope.map((module) => ({
    module: module.moduleNo,
    title: module.moduleTitle,
    topics: module.topics.map((topic) => ({
      name: topic.name,
      subtopics: topic.subtopics,
    })),
  }));

  return `You are scoring university engineering exam sub-topics by their probability of having a question asked from them.

Score independently per module — do not compare topics across modules.

---
TASK:

For each sub-topic, ask one question:
"Across all possible exam papers that could ever be set for this module,
how likely is it that a valid question exists for this topic in at least one of them?"

That probability is the centrality_score.

---

SCORING SCALE:

0.85 to 1.0  → Almost certain a question will be asked from this topic.
            Core of the module. Examiner cannot skip this.
            Student must know this cold.

0.60 to 0.84 → Likely to appear as a direct question.
            Standard examinable content. May appear with internal choice.

0.35 to 0.59 → Possible but not probable as a standalone question.
            May appear as a sub-part within a broader question.

0.10 to 0.34 → Unlikely to be asked directly.
            Background context, motivation, or supporting detail only.
            Most sub-topics belong here.

---

DISTRIBUTION RULE (mandatory):

- Rank topics as a professor who has set this exam multiple times would.
- Do not cluster scores. Every topic must have a meaningfully distinct score.
- If more than half the module scores above 0.65, you have over-inflated.
- Technique-dense modules may have more high-scoring topics than conceptual modules — this is correct, reflect reality honestly.
- If everything scores similarly, you have not made real distinctions. Force discrimination.

---

Return ONLY valid JSON matching this schema:
{
  "scores": [
    { "module": 1, "topic_name": "Transformer Architecture", "subtopic_name": "Self Attention", "centrality_score": 0.95 }
  ]
}

Rules:
- Score every sub-topic exactly once.
- topic_name must exactly match the input topic name.
- subtopic_name must exactly match the input subtopic string.
- If a topic has no subtopics, use the topic name for BOTH topic_name and subtopic_name.
- centrality_score must be a number between 0.10 and 1.0.
- Do not include explanations, preamble, or markdown. Return raw JSON only.
- First character of output must be {

Input scope:
${JSON.stringify(promptScope, null, 2)}`;
}

// =============================================================================
// TE (TEACHER EMPHASIS) PROMPT
// =============================================================================

export interface EnrichedTopic {
  topic_id: string;
  name: string;
  subtopics: string[];
  has_derivation: boolean;
  has_worked_example: boolean;
  has_diagram: boolean;
  has_code: boolean;
  wtf_score: number;
  question_count: number;
}

export function buildTEPrompt(hintText: string, enrichedTopics: EnrichedTopic[]): string {
  return `You are an exam prediction assistant. The student has shared hints from their teacher about what topics are important for the upcoming exam.

Your job is to identify which topics the teacher explicitly emphasized. Most topics should score 0.0. Only score a topic above 0.0 if the teacher directly mentioned or clearly implied it.

For each topic, assign an emphasis_score from 0.0 to 1.0:
- 0.9-1.0 = teacher explicitly and directly emphasized this topic (direct quote, named topic, or strong verbal emphasis)
- 0.7-0.8 = strongly implied - the topic is directly and unmistakably related to something explicitly mentioned
- 0.0 = everything else - indirect mention, partial relevance, tangential, or not mentioned at all

Do NOT use scores between 0.1 and 0.6. There is no middle ground. If a topic was not directly or strongly implied, score it 0.0.

Rules:
- Score every topic in the input exactly once.
- topic_id must match the provided topic_id exactly.
- emphasis_score must be between 0.0 and 1.0.
- reason should be one short sentence explaining why the topic got that score.
- Use the hint text as the primary signal.
- Use enrichment fields only to calibrate ambiguous hints, not to override explicit hints.
- Return ONLY valid JSON in this format:
{
  "scores": [
    {
      "topic_id": "uuid",
      "emphasis_score": 0.85,
      "reason": "teacher explicitly emphasized numericals around this topic"
    }
  ]
}

STUDENT'S TEACHER HINTS:
${JSON.stringify(hintText)}

TOPICS TO SCORE:
${JSON.stringify(enrichedTopics, null, 2)}`;
}

// =============================================================================
// QUESTION GENERATION PROMPT
// =============================================================================

export interface QuestionGenerationInput {
  moduleName: string;
  totalModulesInScope: number;
  topicsWithScores: { name: string; band: "HIGH" | "MEDIUM" | "LOW"; final_score: number }[];
  examScopeTopics: string[];
  pyqs: string[];
  assignmentQuestions: string[];
  teacherHints: string;
  paperPattern: string;
}

export type RoutingTagValue = 'MATH_HEAVY' | 'NUM_MEDIUM' | 'THEORY_IMP' | 'THEORY_STD';

export function buildQuestionGenerationPrompt(input: QuestionGenerationInput): string {
  const { totalModulesInScope } = input;

  return `You are an expert college professor designing a high-stakes exam question bank.
Your task is to generate exam questions for the module: "${input.moduleName}".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXAM CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total modules in this exam scope: ${totalModulesInScope}
You are generating questions for ONE of those modules.
Regardless of how many modules exist, generate a FULL, comprehensive question set for this module — do not reduce quality or quantity based on module count.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW THIS DATA WAS GENERATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The topic scores below were produced by the ETSM (Exam Topic Scoring Model) algorithm.
ETSM evaluates each topic across 5 weighted signals:

- SP  (Syllabus Prominence):     How centrally and repeatedly the topic appears in the syllabus. High SP = core concept.
- NC  (Notes Coverage):          How thoroughly the student's uploaded notes cover this topic. High NC = well-documented.
- WTF (Weighted Test Frequency): How often this topic appeared in past year papers, weighted by recency. High WTF = examiner favourite.
- TE  (Teacher Emphasis):        Direct signal from teacher hints — explicit warnings, "this will come", repeated emphasis. Overrides other signals when strong.
- A   (Assignment Signal):       How heavily this topic was tested in assignments and internal assessments. High A = teacher invested time here.

All signals are normalized and fused into a final_score (0–1). The band (HIGH/MEDIUM/LOW) is the tier cutoff.
Use this matrix as your primary prioritization guide.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATA PROVIDED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. ETSM Prediction Matrix:
${JSON.stringify(input.topicsWithScores, null, 2)}

2. Confirmed Exam Scope Topics:
${input.examScopeTopics.join(", ") || "None specified"}

3. Past Year Questions (PYQs):
${input.pyqs.join("\n") || "None provided"}

4. Assignment Questions:
${input.assignmentQuestions.join("\n") || "None provided"}

5. Teacher Hints:
${input.teacherHints || "None provided"}

6. Paper Pattern:
${input.paperPattern || "None provided"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OBJECTIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generate a dense, high-quality question bank where a student targeting 90+ marks can study efficiently.

Think like the professor who set this paper. You have already seen what topics they care about (ETSM), how they phrased questions before (PYQs), what they invested class time in (assignments), and what they explicitly warned students about (teacher hints). Use ALL of that to reason about what will come.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NUMERICALS — MANDATORY, ZERO EXCEPTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Engineering exams almost always include numericals. Follow every rule below without compromise:

- COVERAGE: Generate a numerical question for EVERY distinct formula, algorithm, worked example, or derivation that appears anywhere in the data — PYQs, assignments, notes, or scope topics. Even if it seems small or trivial.
- NO SKIPPING: Do NOT skip a numerical because the ETSM score is low. If a formula appears in assignments or PYQs, the examiner uses it. It must become a question.
- DERIVATIONS: Derivations are high-value questions. If a derivation is mentioned or implied anywhere in the data, include a "Derive the expression for..." question. Tag it question_type NUMERICAL.
- SMALL NUMERICALS: Small plug-and-chug numericals still count. If there's a formula with 2-3 variables, generate an application question with example values.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUANTITY RULES (STRICTLY ENFORCED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You MUST generate a massive, comprehensive question bank. If you generate fewer than 25 questions, you have failed.
- Tag 1 (3H — Crunch):    Target 5–7 questions (Highest yield).
- Tag 2 (8H — Focused):   Target 8–15 ADDITIONAL questions.
- Tag 3 (2D — Full):      Target 15–30 ADDITIONAL questions.
- MINIMUM TOTAL QUESTIONS: 25 questions.
- MAXIMUM TOTAL QUESTIONS: 55 questions.

CRITICAL: Do NOT get lazy and stop after generating the Tag 1 questions. You MUST generate the Tag 2 and Tag 3 questions as well. Keep generating until you have thoroughly covered every topic provided in the ETSM matrix.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STUDY MODE TAGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tag every question with an integer study_mode_tag (1, 2, or 3):

- 1 (3H — Crunch Mode):   Minimum viable set to score 90+. Highest-confidence, highest-yield only.
- 2 (8H — Focused Mode):  Adds important supporting questions on top of Tag 1.
- 3 (2D — Full Coverage): Everything else — full coverage, no blind spots.

Tag 1 questions are always shown in Tag 2 and Tag 3 views.
Tag 2 questions are always shown in Tag 3 views.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIAGRAMS — MERMAID SYNTAX (STRICT RULES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ONLY generate a diagram_svg if the question inherently REQUIRES an image as part of the question itself (e.g., "Analyze the following flowchart and find the output:", "Calculate the cyclomatic complexity for this graph:"). 
Do NOT generate a diagram to explain a concept — explaining concepts is the Answer's job. If the question text doesn't explicitly need an accompanying image to be understood, return null for diagram_svg.

When you do need to generate a diagram for the question:
- MAKE DIAGRAMS DETAILED AND DESCRIPTIVE. Every node MUST have a meaningful, human-readable label.
  WRONG: 1 --> 2 --> 3
  CORRECT: start[Start] --> checkA{a > b} -->|Yes| printD[print d]
- Use Mermaid diagram types that fit: flowcharts, sequence diagrams, state diagrams, class diagrams.
- Include the raw Mermaid string in the "diagram_svg" field. If no diagram is needed, return null (the JSON null literal, NOT the string "null").

MERMAID SYNTAX RULES (MUST FOLLOW):
1. NODE IDS: Use clean camelCase IDs with no spaces or special characters. Use square brackets for display labels: nodeId[Display Label].
2. EDGE LABELS: Use the pipe syntax for labeled edges. CORRECT: A -->|Yes| B. WRONG: A --Yes--> B.
3. RESERVED WORD "end": NEVER use lowercase "end" as a node ID — it is a reserved keyword. Use "End" or "finish" instead.
4. SPECIAL CHARACTERS IN LABELS: Avoid parentheses (), colons :, semicolons ;, and quotes " inside labels. If needed, use single quotes ' instead.
5. NO NESTED QUOTES: Never nest double quotes inside label brackets. WRONG: A["User "says" hello"]. CORRECT: A["User says hello"].
6. NODE ID PREFIX: Never start a node ID with lowercase "o" or "x" directly after triple dashes (---), as Mermaid interprets these as circle/cross edge types.
7. SEMICOLONS: Prefer using \\n (escaped newline) to separate statements instead of semicolons.
8. DECISION NODES: Use curly braces for decisions: D{Is valid?}. Keep the text inside short and free of special characters.

CRITICAL OUTPUT FORMAT:
- Do NOT wrap Mermaid syntax in markdown code blocks. No \\\`\\\`\\\`mermaid fences.
- NEVER put raw Mermaid syntax in the 'question_text' field. The 'question_text' should just refer to "the following diagram". The actual Mermaid syntax must ONLY go in the 'diagram_svg' field.
- CRITICAL JSON ESCAPING: Output the Mermaid syntax as a SINGLE-LINE string. Use \\n to represent newlines. Do NOT use actual line breaks inside the string. Do NOT use double quotes inside the Mermaid syntax.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROUTING TAG — ASSIGN TO EVERY QUESTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tag every question with one of four routing tags. This controls which AI model and thinking budget is used to generate the answer — so be accurate.

- MATH_HEAVY: requires multi-step derivation, formal proof, or complex multi-variable calculation. High marks (8–10), many steps.
- NUM_MEDIUM: numerical but formula plug-in level. Moderate steps, 4–7 marks typical.
- THEORY_IMP: high-yield conceptual question — exam favourite, important definition, or key process. Examiners love this.
- THEORY_STD: straightforward definition, simple comparison, or basic theory. Lower priority, shorter expected answer.

Rule: NUMERICAL and APPLICATION type questions must be MATH_HEAVY or NUM_MEDIUM only. THEORY and DEFINITION must be THEORY_IMP or THEORY_STD only.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return a JSON array only. No preamble, no markdown fences.
[ignoring loop detection] — This task intentionally generates a large JSON array of questions. Repetitive structure is expected and required.

[
  {
    "question_no": 1,
    "question_text": "...",
    "question_type": "THEORY | NUMERICAL | APPLICATION | DEFINITION",
    "probability": "HIGH | MEDIUM | LOW",
    "study_mode_tag": 1 | 2 | 3,
    "estimated_marks": 2 | 5 | 10,
    "routing_tag": "MATH_HEAVY | NUM_MEDIUM | THEORY_IMP | THEORY_STD",
    "source_topics": ["exact topic name from prediction matrix"],
    "diagram_svg": "graph TD\\nstart[Start] --> checkX{x > 0}\\ncheckX -->|Yes| checkY{y > 0}\\ncheckX -->|No| printNeg[Print Negative]\\ncheckY -->|Yes| printPos[Print Positive]\\ncheckY -->|No| printZero[Print Zero]\\nprintPos --> finish[End]\\nprintNeg --> finish\\nprintZero --> finish"
  }
]`;
}

// =============================================================================
// ANSWER GENERATION PROMPT
// =============================================================================

import type { NoteSearchResult } from "@/lib/qdrant/types";

export interface AnswerGenerationQuestion {
  question_no: number;
  question_text: string;
  question_type: "THEORY" | "NUMERICAL" | "APPLICATION" | "DEFINITION";
  estimated_marks: number;
  routing_tag: string;
  ragChunks: NoteSearchResult[];
}

export interface AnswerGenerationInput {
  moduleName: string;
  questions: AnswerGenerationQuestion[];
}

export function buildAnswerGenerationPrompt(input: AnswerGenerationInput): string {
  const questionsContext = input.questions
    .map((question) => {
      const chunks = question.ragChunks
        .slice(0, 8)
        .map((chunk, index) => {
          const content = chunk.payload.content?.slice(0, 400) ?? "";
          if (!content) return null;

          const hasDiagram = chunk.payload.has_diagram ? " [HAS_DIAGRAM]" : "";
          return `[CHUNK ${index + 1} — page ${chunk.payload.page ?? "N/A"}, file: ${chunk.payload.filename}${hasDiagram}]
Content: ${content}`;
        })
        .filter((chunk): chunk is string => Boolean(chunk));

      const minWords = question.estimated_marks * 40;
      const maxWords = question.estimated_marks * 75;
      const targetRange = `${question.estimated_marks * 40}–${question.estimated_marks * 65}`;

      return `--- QUESTION ${question.question_no} [${question.question_type}] [${question.estimated_marks} marks] ---
${question.question_text}

WORD COUNT TARGET FOR THIS QUESTION: minimum ${minWords} words, target ${targetRange} words, hard maximum ${maxWords} words.

TEACHER NOTES REFERENCE (what your teacher actually covered — use as grounding, not copy-paste):
${chunks.length > 0 ? chunks.join("\n\n") : "No teacher notes available — rely on your knowledge base."}`;
    })
    .join("\n\n");

  return `You are an expert academic answer writer for engineering college exams.
Your task is to write detailed, exam-ready answers for the module: "${input.moduleName}"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR ROLE & HOW TO USE THE NOTES CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For each question, you are given excerpts from the student's teacher's notes (TEACHER NOTES REFERENCE).
These chunks show WHAT the teacher actually taught — their emphasis, examples, and approach.
Your job is to use that as a foundation and combine it with your own deep knowledge base to write an answer
that would fetch the student FULL MARKS in their university exam.

DO NOT just copy-paste the chunks. The chunks are a reference, not the answer.
Elaborate, structure, and go deep. Write like a top student who studied the notes AND the full subject.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORD COUNT RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Each question specifies its own target word count. Always follow it.

| Marks | Minimum | Target Range | Hard Maximum |
|-------|---------|--------------|---------------|
| 2     | 80      | 80–130       | 150           |
| 3     | 120     | 120–195      | 225           |
| 4     | 160     | 160–260      | 300           |
| 5     | 200     | 200–325      | 375           |
| 6     | 240     | 240–390      | 450           |
| 7     | 280     | 280–455      | 525           |
| 8     | 320     | 320–520      | 600           |
| 9     | 360     | 360–585      | 675           |
| 10    | 400     | 400–650      | 750           |

Interpolation for any other marks value:
- Minimum = marks × 40, Target = marks × 40 to marks × 65, Maximum = marks × 75

Freedom rule:
- Complex multi-component or derivation-heavy questions → push toward Hard Maximum
- Simple single-concept definitions → stay in Target Range
- NEVER pad to hit a number — every sentence must earn its place
- NEVER cut a concept mid-explanation to stay under the ceiling

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANSWER FORMAT (STRICTLY FOLLOW PER QUESTION TYPE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THEORY:
- Use headings (###) for each distinct concept or section.
- Cover: definition, explanation, key characteristics, real-world relevance, and examples.
- Each bullet is one complete, exam-ready sentence.

DEFINITION:
- First line: the formal definition.
- Follow with key attributes, distinguishing features, and one concrete example.

NUMERICAL:
- State the given values and what is to be found.
- Show full step-by-step working. Label each step clearly (Step 1, Step 2…).
- Show all substitution, intermediate calculations, and final answer with units.
- Do not skip any algebraic steps.

APPLICATION:
- Describe the scenario, apply the concept clearly, state the outcome.
- Be specific and concrete. Avoid generic statements.

GENERAL RULES:
- Format using rich Markdown (bold, italics, bullets, numbered lists, blockquotes, headings).
- ALL math expressions, formulas, variables — even simple ones like $n=5$ or $100\\%$ — MUST be wrapped in LaTeX ($inline$ or $$block$$). NEVER output raw math. Use $$block$$ (double dollar signs) for all standalone formulas and equations to make them big and clear.
- Always use double newlines between paragraphs and bullet points so they render correctly.
- CRITICAL: Highlight important key words and jargon in **bold**. (Our UI styles bold text as bright yellow to help students learn faster).
- DO NOT mention "Chunk 1", "According to the notes", or "The provided text says...". Write as if you are the student in the exam hall.
- Do not repeat the question text.

SAMPLE EXAM-READY ANSWER FORMAT:
### Introduction
**System Test Automation** refers to the process of automating the execution of system test cases, aiming to improve efficiency, speed, and coverage during validation.

### Key Prerequisites:
* **Stable System:** The system under test must be stable with well-defined functionalities.
* **Clear Test Cases:** Test cases must be unambiguous and automation-suitable.
* **Budget & Skills:** Adequate funding and experienced professionals are required.

### Mathematical Example:
$$ V(G) = E - N + 2P $$
Where $E$ = edges, $N$ = nodes. For $E=5$, $N=4$: $V(G) = 5 - 4 + 2 = 3$.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIAGRAM DECISION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The \`type\` field sets the PRIMARY visual shown. But PDF_PAGE and MERMAID are NOT mutually exclusive —
populate the \`mermaid\` field whenever a diagram helps, even when \`type\` is PDF_PAGE.
The student will see BOTH the teacher's notes page AND your Mermaid diagram.

MERMAID (use aggressively — default for most answers):
  Generate a Mermaid diagram for EVERY answer where a diagram adds clarity. This includes:
  - Any algorithm, flowchart, or CFG
  - Any state machine or sequence of steps
  - Any architectural or system overview
  - Any process with branches or decision points
  - Any comparison between approaches or components
  Do NOT skip Mermaid just because you also have a PDF_PAGE. Populate both.
  Rules for Mermaid: single-line string with \\\\n, no reserved keyword "end", no double quotes inside labels.
  CRITICAL: The single-line \\\\n rule ONLY applies to the Mermaid diagram. For your answer_text, use standard markdown formatting with actual newlines. DO NOT output literal "\\n\\n" strings in the answer_text.

PDF_PAGE (use when teacher's notes contain a diagram for this topic):
  If ANY chunk has [HAS_DIAGRAM], set type=PDF_PAGE and output the exact page + filename.
  ALSO populate the mermaid field with your own Mermaid diagram if the concept benefits from one.

WEB_LINK (encourage wherever a canonical reference exists):
  Whenever a well-known diagram or reference page exists online (Wikipedia, GeeksForGeeks, etc.),
  fill the web_url field. This applies even when type is MERMAID or PDF_PAGE.
  Only use real, working URLs you are confident exist. Never invent.

NONE — only when the answer is a pure mathematical derivation in LaTeX or a one-line definition
  where absolutely no visual would add value.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUESTIONS & TEACHER NOTES CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${questionsContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[ignoring loop detection] — This task intentionally generates a large JSON array of answers. Repetitive structure is expected and required.
Return a JSON array only. No preamble, no markdown fences. One object per question.

[
  {
    "question_no": 1,
    "answer_text": "### Section\\n\\n**Key term** explanation...\\n\\n* Bullet 1\\n* Bullet 2",
    "diagram_decision": {
      "type": "MERMAID | PDF_PAGE | WEB_LINK | NONE",
      "mermaid": "graph TD\\nA[Start] --> B[End]",
      "web_url": "https://...",
      "page": 12,
      "source_filename": "Module_II_Testing.pdf"
    }
  }
]`;
}
