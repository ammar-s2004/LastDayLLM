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
