import { task, logger } from "@trigger.dev/sdk";
import { z } from "zod";
import { jsonrepair } from "jsonrepair";

import { GEMINI_MODEL_QUESTIONS, AI_BACKUP_MODEL, getThinkingConfig } from "@/lib/ai-limits";
import { buildQuestionGenerationPrompt } from "@/lib/ai-prompts";
import { parseCombinedHints } from "@/lib/hints";
import { supabaseWorker } from "@/lib/supabase-worker";

let _genAI: any = null;
function getGenAI() {
  if (!_genAI) {
    const { GoogleGenAI } = require("@google/genai");
    _genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });
  }

  return _genAI;
}

const QUESTION_GENERATION_MODEL_LABEL = GEMINI_MODEL_QUESTIONS;
const MAX_OUTPUT_TOKENS = 48_000; // Model hard cap = 64k total (thinking + output). MEDIUM thinking ~8-15k → safe output ceiling is ~48k

const GeneratedQuestionSchema = z.object({
  question_no: z.coerce.number().int().positive(),
  question_text: z.string().min(1).max(4000),
  question_type: z.enum(["THEORY", "NUMERICAL", "APPLICATION", "DEFINITION"]),
  probability: z.enum(["HIGH", "MEDIUM", "LOW"]),
  study_mode_tag: z.coerce.number().int().min(1).max(3),
  estimated_marks: z.coerce.number().int().positive().max(100),
  routing_tag: z.enum(["MATH_HEAVY", "NUM_MEDIUM", "THEORY_IMP", "THEORY_STD"]).default("THEORY_IMP"),
  source_topics: z.array(z.string().min(1)).default([]),
  diagram_svg: z.string().optional().nullable(),
});

const GeneratedQuestionsSchema = z.array(GeneratedQuestionSchema).min(1).max(60);

type TopicScore = {
  topic_id: string;
  final_score: number | null;
  band: "HIGH" | "MEDIUM" | "LOW";
  topics?: {
    id?: string;
    name?: string | null;
    module_id?: string | null;
  } | null;
};

type QuestionRow = {
  id: string;
  text: string;
  marks: number | null;
  resources?: { resource_type?: string | null } | null;
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
    logger.warn("[extractJsonArray] Strict JSON.parse failed. Attempting to repair JSON.", { error: String(error) });
    const repairedJson = jsonrepair(rawJson);
    return JSON.parse(repairedJson);
  }
}

async function generateWithModel(prompt: string, model: string) {
  return getGenAI().models.generateContent({
    model,
    contents: prompt,
    config: {
      // MEDIUM thinking: light self-correction without eating the output budget.
      // 65k maxOutputTokens is the model ceiling — it only uses what it needs.
      ...(model.startsWith("gemini-3.1") || model.startsWith("gemma-4")
        ? { thinkingConfig: { thinkingLevel: "MEDIUM" as any } }
        : { thinkingConfig: { thinkingBudget: 4000 } }
      ),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.25,
      responseMimeType: "application/json",
      responseSchema: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question_no: { type: "number" },
            question_text: { type: "string" },
            question_type: { type: "string", enum: ["THEORY", "NUMERICAL", "APPLICATION", "DEFINITION"] },
            probability: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
            study_mode_tag: { type: "number" },
            estimated_marks: { type: "number" },
            routing_tag: { type: "string", enum: ["MATH_HEAVY", "NUM_MEDIUM", "THEORY_IMP", "THEORY_STD"] },
            source_topics: { type: "array", items: { type: "string" } },
            diagram_svg: { type: "string" },
          },
          required: [
            "question_no",
            "question_text",
            "question_type",
            "probability",
            "study_mode_tag",
            "estimated_marks",
            "routing_tag",
            "source_topics",
          ],
        },
      },
    },
  });
}

export const generateQuestionsTask = task({
  id: "generate-questions",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 15000,
  },
  run: async (payload: {
    subjectId: string;
    userId: string;
    moduleId: string;
    predictionRunId: string;
    totalModulesInScope: number;
  }) => {
    const { subjectId, userId, moduleId, predictionRunId, totalModulesInScope } = payload;

    logger.info("[generate-questions] Starting", { subjectId, moduleId, predictionRunId });

    const { data: moduleInfo, error: moduleError } = await supabaseWorker
      .from("modules")
      .select("id, module_no, title, topics:topics(id, name, parent_topic_id)")
      .eq("id", moduleId)
      .eq("subject_id", subjectId)
      .single();

    if (moduleError || !moduleInfo) {
      throw new Error(`[generate-questions] Failed to fetch module: ${moduleError?.message ?? "Not found"}`);
    }

    const { data: predictionRun, error: predictionRunError } = await supabaseWorker
      .from("prediction_runs")
      .select("id, subject_id, user_id")
      .eq("id", predictionRunId)
      .eq("subject_id", subjectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (predictionRunError || !predictionRun) {
      throw new Error(
        `[generate-questions] Failed to verify prediction run: ${predictionRunError?.message ?? "Not found"}`
      );
    }

    const moduleTopics = ((moduleInfo as any).topics ?? []) as Array<{
      id: string;
      name: string;
      parent_topic_id: string | null;
    }>;
    const moduleTopicIds = moduleTopics.map((topic) => topic.id);

    const [scoresResult, examScopesResult, hintsResult, questionLinksResult] = await Promise.all([
      supabaseWorker
        .from("prediction_topic_scores")
        .select("topic_id, final_score, band, topics(id, name, module_id)")
        .eq("prediction_run_id", predictionRunId),
      supabaseWorker
        .from("exam_scopes")
        .select("id, exam_scope_topics(topic_id, topics(name))")
        .eq("subject_id", subjectId)
        .eq("user_id", userId),
      supabaseWorker
        .from("teacher_hints")
        .select("hint_text")
        .eq("subject_id", subjectId)
        .is("exam_type", null)
        .is("exam_label", null)
        .limit(1)
        .maybeSingle(),
      moduleTopicIds.length > 0
        ? supabaseWorker.from("question_topics").select("question_id").in("topic_id", moduleTopicIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (scoresResult.error) {
      throw new Error(`[generate-questions] Failed to fetch scores: ${scoresResult.error.message}`);
    }
    if (examScopesResult.error) {
      throw new Error(`[generate-questions] Failed to fetch exam scope: ${examScopesResult.error.message}`);
    }
    if (hintsResult.error) {
      throw new Error(`[generate-questions] Failed to fetch teacher hints: ${hintsResult.error.message}`);
    }
    if (questionLinksResult.error) {
      throw new Error(`[generate-questions] Failed to fetch module question links: ${questionLinksResult.error.message}`);
    }

    const scores = ((scoresResult.data ?? []) as TopicScore[])
      .filter((score) => score.topics?.module_id === moduleId || moduleTopicIds.includes(score.topic_id))
      .map((score) => ({
        name: score.topics?.name ?? "Unnamed topic",
        band: score.band,
        final_score: score.final_score ?? 0,
      }))
      .sort((a, b) => b.final_score - a.final_score);

    const examScopeTopics = ((examScopesResult.data ?? []) as any[]).flatMap((scope) =>
      (scope.exam_scope_topics ?? [])
        .filter((entry: any) => !moduleTopicIds.length || moduleTopicIds.includes(entry.topic_id))
        .map((entry: any) => entry.topics?.name)
        .filter((name: unknown): name is string => typeof name === "string" && name.length > 0)
    );

    const questionIds = [
      ...new Set(((questionLinksResult.data ?? []) as Array<{ question_id: string }>).map((row) => row.question_id)),
    ];

    let pyqs: string[] = [];
    let assignmentQuestions: string[] = [];

    if (questionIds.length > 0) {
      const { data: questions, error: questionsError } = await supabaseWorker
        .from("questions")
        .select("id, text, marks, resources(resource_type)")
        .eq("subject_id", subjectId)
        .in("id", questionIds);

      if (questionsError) {
        throw new Error(`[generate-questions] Failed to fetch PYQs and assignments: ${questionsError.message}`);
      }

      for (const question of (questions ?? []) as QuestionRow[]) {
        const text = question.marks ? `${question.text} (${question.marks} marks)` : question.text;

        if (question.resources?.resource_type === "ASSIGNMENT") {
          assignmentQuestions.push(text);
        } else {
          pyqs.push(text);
        }
      }
    }

    const parsedHints = parseCombinedHints((hintsResult.data as { hint_text?: string | null } | null)?.hint_text);
    const prompt = buildQuestionGenerationPrompt({
      moduleName: `Module ${(moduleInfo as any).module_no}: ${(moduleInfo as any).title}`,
      totalModulesInScope,
      topicsWithScores: scores,
      examScopeTopics: [...new Set(examScopeTopics)],
      pyqs,
      assignmentQuestions,
      teacherHints: parsedHints.teacherHints,
      paperPattern: parsedHints.paperPattern,
    });

    let response;
    let modelUsed = GEMINI_MODEL_QUESTIONS;

    try {
      response = await generateWithModel(prompt, GEMINI_MODEL_QUESTIONS);
    } catch (error: any) {
      logger.warn("[generate-questions] Primary model failed, trying fallback", {
        model: GEMINI_MODEL_QUESTIONS,
        error: error.message,
      });
      modelUsed = AI_BACKUP_MODEL;
      response = await generateWithModel(prompt, AI_BACKUP_MODEL);
    }

    const responseText =
      response.text ??
      response.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? "").join("") ??
      "";

    const questions = GeneratedQuestionsSchema.parse(extractJsonArray(responseText));

    const { error: deleteError } = await supabaseWorker
      .from("generated_questions")
      .delete()
      .eq("module_id", moduleId)
      .eq("prediction_run_id", predictionRunId);

    if (deleteError) {
      throw new Error(`[generate-questions] Failed to delete existing questions: ${deleteError.message}`);
    }

    const { error: insertError } = await supabaseWorker.from("generated_questions").insert(
      questions.map((question, index) => ({
        prediction_run_id: predictionRunId,
        subject_id: subjectId,
        user_id: userId,
        module_id: moduleId,
        question_no: question.question_no || index + 1,
        question_text: question.question_text,
        answer_text: null,
        question_type: question.question_type,
        estimated_marks: question.estimated_marks,
        probability: question.probability,
        study_mode_tag: question.study_mode_tag,
        routing_tag: question.routing_tag ?? 'THEORY_IMP',
        source_topics: question.source_topics,
        diagram_svg: (() => {
          const raw = question.diagram_svg?.trim();
          if (!raw || raw === 'null' || raw === 'undefined' || raw.length < 8) return null;
          return raw;
        })(),
        ai_model: QUESTION_GENERATION_MODEL_LABEL,
      }))
    );

    if (insertError) {
      throw new Error(`[generate-questions] Failed to insert generated questions: ${insertError.message}`);
    }


    logger.info("[generate-questions] Completed", {
      subjectId,
      moduleId,
      predictionRunId,
      modelUsed,
      questions: questions.length,
    });

    return {
      success: true,
      questionsGenerated: questions.length,
      modelUsed,
    };
  },
});
