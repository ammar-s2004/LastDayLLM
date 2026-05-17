import { task, logger } from "@trigger.dev/sdk";
import { z } from "zod";
import { jsonrepair } from "jsonrepair";

import { MODEL_ROUTER, DEFAULT_ROUTING_TAG, type RoutingTag } from "@/lib/ai-limits";
import { buildAnswerGenerationPrompt } from "@/lib/ai-prompts";
import { generateBatchEmbeddings } from "@/lib/embeddings";
import { supabaseWorker } from "@/lib/supabase-worker";
import { searchNotesHybrid, detectTopicsFromQuestion } from "@/lib/qdrant/operations";
import type { NoteSearchResult } from "@/lib/qdrant/types";

const RAG_CHUNKS_PER_QUESTION = 8;

let _genAI: any = null;
function getGenAI() {
  if (!_genAI) {
    const { GoogleGenAI } = require("@google/genai");
    _genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });
  }
  return _genAI;
}

const AnswerSchema = z.object({
  question_no: z.coerce.number().int().positive(),
  answer_text: z.string().min(1).max(12000),
  diagram_decision: z.object({
    type: z.enum(["MERMAID", "PDF_PAGE", "WEB_LINK", "NONE"]),
    mermaid: z.string().optional().nullable(),
    web_url: z.string().optional().nullable(),
    page: z.coerce.number().int().positive().optional().nullable(),
    source_filename: z.string().optional().nullable(),
  }),
});

const AnswersSchema = z.array(AnswerSchema).min(1).max(80);

type GeneratedQuestionRow = {
  id: string;
  question_no: number;
  question_text: string;
  question_type: "THEORY" | "NUMERICAL" | "APPLICATION" | "DEFINITION";
  estimated_marks: number;
  routing_tag: string | null;
  source_topics: string[] | null;
};

type UploadMetadata = {
  id: string;
  storage_path: string | null;
  original_filename: string | null;
};

function extractJsonArray(text: string) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON array found in AI response.");
  }

  const rawJson = text.slice(start, end + 1);
  try {
    return JSON.parse(rawJson);
  } catch (error) {
    logger.warn("[generate-answers] Strict JSON.parse failed. Attempting to repair JSON.", { error: String(error) });
    const repairedJson = jsonrepair(rawJson);
    return JSON.parse(repairedJson);
  }
}

/**
 * Run answer generation for a batch of questions using the router config for their tag.
 * Returns parsed answers array or throws.
 */
async function generateAnswerBatch(
  questions: Array<{
    question_no: number;
    question_text: string;
    question_type: "THEORY" | "NUMERICAL" | "APPLICATION" | "DEFINITION";
    estimated_marks: number;
    routing_tag: string;
    ragChunks: NoteSearchResult[];
  }>,
  routingTag: RoutingTag,
  moduleName: string
): Promise<z.infer<typeof AnswersSchema>> {
  const routerConfig = MODEL_ROUTER[routingTag];

  const prompt = buildAnswerGenerationPrompt({
    moduleName,
    questions,
  });

  const response = await getGenAI().models.generateContent({
    model: routerConfig.model,
    contents: prompt,
    config: {
      thinkingConfig: routerConfig.thinkingConfig,
      maxOutputTokens: 65536,
      temperature: 0.15,
      responseMimeType: "application/json",
      responseSchema: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question_no: { type: "number" },
            answer_text: { type: "string" },
            diagram_decision: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["MERMAID", "PDF_PAGE", "WEB_LINK", "NONE"] },
                mermaid: { type: "string", nullable: true },
                web_url: { type: "string", nullable: true },
                page: { type: "number", nullable: true },
                source_filename: { type: "string", nullable: true },
              },
              required: ["type", "mermaid", "web_url", "page", "source_filename"],
            },
          },
          required: ["question_no", "answer_text", "diagram_decision"],
        },
      },
    },
  });

  const responseText =
    response.text ??
    response.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? "").join("") ??
    "";

  return AnswersSchema.parse(extractJsonArray(responseText));
}

function buildPageRef(
  answer: z.infer<typeof AnswerSchema>,
  chunksByQuestionNo: Map<number, NoteSearchResult[]>,
  metadataByUploadId: Map<string, UploadMetadata>
) {
  const sourceFilename = answer.diagram_decision.source_filename;
  const page = answer.diagram_decision.page;
  if (!sourceFilename || !page) return null;

  const chunks = chunksByQuestionNo.get(answer.question_no) ?? [];
  const matchingChunk = chunks.find((chunk) => chunk.payload.filename === sourceFilename);
  if (!matchingChunk) return null;

  const uploadId = matchingChunk.payload.upload_id;
  const metadata = metadataByUploadId.get(uploadId);
  if (!metadata?.storage_path) return null;

  return {
    storage_path: metadata.storage_path,
    page,
    filename: metadata.original_filename ?? sourceFilename,
  };
}

export const generateAnswersTask = task({
  id: "generate-answers",
  queue: { name: "answer-generation", concurrencyLimit: 5 },
  retry: { maxAttempts: 2, factor: 2, minTimeoutInMs: 3000, maxTimeoutInMs: 15000 },
  run: async (payload: {
    subjectId: string;
    userId: string;
    moduleId: string;
    predictionRunId: string;
    collegeId: string | null;
  }) => {
    const { subjectId, userId, moduleId, predictionRunId, collegeId } = payload;

    logger.info("[generate-answers] Starting", { subjectId, moduleId, predictionRunId });

    const { data: questionsData, error: questionsError } = await supabaseWorker
      .from("generated_questions")
      .select("id, question_no, question_text, question_type, estimated_marks, routing_tag, source_topics")
      .eq("module_id", moduleId)
      .eq("prediction_run_id", predictionRunId)
      .order("question_no", { ascending: true });

    if (questionsError) {
      throw new Error(`[generate-answers] Failed to fetch questions: ${questionsError.message}`);
    }

    const questions = (questionsData ?? []) as GeneratedQuestionRow[];
    if (questions.length === 0) {
      logger.warn("[generate-answers] No questions found", { moduleId, predictionRunId });
      return { success: false, reason: "No generated questions found." };
    }

    const { data: moduleInfo, error: moduleError } = await supabaseWorker
      .from("modules")
      .select("module_no, title")
      .eq("id", moduleId)
      .maybeSingle();

    if (moduleError) {
      throw new Error(`[generate-answers] Failed to fetch module info: ${moduleError.message}`);
    }

    const { data: topicsData, error: topicsError } = await supabaseWorker
      .from("topics")
      .select("name")
      .eq("module_id", moduleId);

    if (topicsError) {
      throw new Error(`[generate-answers] Failed to fetch module topics: ${topicsError.message}`);
    }

    const allModuleTopics = ((topicsData ?? []) as Array<{ name: string | null }>)
      .map((topic) => topic.name)
      .filter((name): name is string => Boolean(name));

    const ragChunksByQuestionNo = new Map<number, NoteSearchResult[]>();
    const allRetrievedChunks: NoteSearchResult[] = [];

    const embeddings = await generateBatchEmbeddings(questions.map((q) => q.question_text));

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const embedding = embeddings[i];
      const detectedTopics = detectTopicsFromQuestion(question.question_text, allModuleTopics);
      const mergedTopics = [...new Set([...(question.source_topics ?? []), ...detectedTopics])];

      const { results } = await searchNotesHybrid(
        embedding,
        {
          ...(collegeId ? { college_id: collegeId } : {}),
          subject_id: subjectId,
        },
        mergedTopics,
        `${question.question_text} ${mergedTopics.join(" ")}`,
        RAG_CHUNKS_PER_QUESTION
      );

      ragChunksByQuestionNo.set(question.question_no, results);
      allRetrievedChunks.push(...results);
    }

    const uploadIds = [...new Set(allRetrievedChunks.map((chunk) => chunk.payload.upload_id).filter(Boolean))];
    const metadataByUploadId = new Map<string, UploadMetadata>();

    if (uploadIds.length > 0) {
      const { data: metadataRows, error: metadataError } = await supabaseWorker
        .from("qdrant_notes_metadata")
        .select("id, storage_path, original_filename")
        .in("id", uploadIds);

      if (metadataError) {
        throw new Error(`[generate-answers] Failed to fetch note metadata: ${metadataError.message}`);
      }

      for (const row of (metadataRows ?? []) as UploadMetadata[]) {
        metadataByUploadId.set(row.id, row);
      }
    }

    const moduleName = `Module ${(moduleInfo as any)?.module_no ?? ""}: ${(moduleInfo as any)?.title ?? "Unknown"}`;

    // Group questions by routing_tag, falling back to DEFAULT_ROUTING_TAG for NULLs
    const tagGroups = new Map<RoutingTag, typeof questions>();
    for (const question of questions) {
      const tag = (question.routing_tag ?? DEFAULT_ROUTING_TAG) as RoutingTag;
      const validTag = tag in MODEL_ROUTER ? tag : DEFAULT_ROUTING_TAG;
      const existing = tagGroups.get(validTag) ?? [];
      existing.push(question);
      tagGroups.set(validTag, existing);
    }

    logger.info("[generate-answers] Routing groups", {
      moduleId,
      groups: Object.fromEntries([...tagGroups.entries()].map(([tag, qs]) => [tag, qs.length])),
    });

    // Chunk questions within tag groups into batches of 5 and run in parallel
    const BATCH_SIZE = 5;
    const batchPromises: Promise<{ tag: RoutingTag; answers: z.infer<typeof AnswersSchema> }>[] = [];

    for (const [tag, groupQuestions] of tagGroups.entries()) {
      for (let i = 0; i < groupQuestions.length; i += BATCH_SIZE) {
        const chunk = groupQuestions.slice(i, i + BATCH_SIZE);
        
        batchPromises.push(
          (async () => {
            const batchInput = chunk.map((q) => ({
              question_no: q.question_no,
              question_text: q.question_text,
              question_type: q.question_type,
              estimated_marks: q.estimated_marks,
              routing_tag: tag,
              ragChunks: ragChunksByQuestionNo.get(q.question_no) ?? [],
            }));

            logger.info(`[generate-answers] Calling ${MODEL_ROUTER[tag].model} for ${tag} (${chunk.length} questions, chunk ${Math.floor(i / BATCH_SIZE) + 1})`, { moduleId });

            try {
              const answers = await generateAnswerBatch(batchInput, tag, moduleName);
              return { tag, answers };
            } catch (err: any) {
              logger.error(`[generate-answers] Batch failed for tag ${tag} chunk`, {
                tag,
                model: MODEL_ROUTER[tag].model,
                error: err?.message ?? String(err),
              });
              return { tag, answers: [] as z.infer<typeof AnswersSchema> };
            }
          })()
        );
      }
    }

    const batchResults = await Promise.all(batchPromises);

    // Merge all answers and write to DB
    const questionIdByNo = new Map(questions.map((q) => [q.question_no, q.id]));
    let totalWritten = 0;

    for (const { answers } of batchResults) {
      for (const answer of answers) {
        const questionId = questionIdByNo.get(answer.question_no);
        if (!questionId) continue;

        const diagramType = answer.diagram_decision.type;
        const pageRef = buildPageRef(answer, ragChunksByQuestionNo, metadataByUploadId);
        const chunks = ragChunksByQuestionNo.get(answer.question_no) ?? [];
        const sources = chunks.slice(0, 8).map((chunk) => ({
          filename: chunk.payload.filename,
          page: chunk.payload.page ?? null,
          content_preview: (chunk.payload.content ?? "").slice(0, 200),
          upload_id: chunk.payload.upload_id,
        }));

        const { error: updateError } = await supabaseWorker
          .from("generated_questions")
          .update({
            answer_text: answer.answer_text,
            answer_diagram_type: diagramType,
            answer_diagram_mermaid: answer.diagram_decision.mermaid ?? null,
            answer_diagram_web_url: answer.diagram_decision.web_url ?? null,
            answer_diagram_page_ref: pageRef,
            answer_sources: sources,
          })
          .eq("id", questionId);

        if (updateError) {
          logger.error(`[generate-answers] Failed to update answer ${answer.question_no}`, {
            error: updateError.message,
            questionId,
          });
          continue;
        }

        totalWritten++;
      }
    }

    logger.info("[generate-answers] Completed", {
      subjectId,
      moduleId,
      predictionRunId,
      totalWritten,
      groups: batchResults.map(({ tag, answers }) => ({ tag, count: answers.length })),
    });

    return { success: true, answersGenerated: totalWritten };
  },
});
