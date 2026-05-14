import { task, logger } from "@trigger.dev/sdk";
import { supabaseWorker } from "@/lib/supabase-worker";
import { z } from "zod";
import { GEMINI_MODEL_QUESTIONS, AI_BACKUP_MODEL, getThinkingConfig } from "@/lib/ai-limits";
import { buildPYQExtractionPrompt } from "@/lib/ai-prompts";
import { resolveChildTopicIds } from "@/lib/shared/resolve-children";
import { computeWTFTask } from "./compute-wtf";

// Lazy-loaded Google AI client
let _genAI: any = null;
function getGenAI() {
  if (!_genAI) {
    const { GoogleGenAI } = require("@google/genai");
    _genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });
  }
  return _genAI;
}

const MAX_AI_OUTPUT_CHARS = 500_000;

const VALID_EXAM_TYPES = new Set([
  "MID_SEM",
  "END_SEM",
  "PRACTICE",
  "ASSIGNMENT",
  "QUIZ",
]);

/* ======================================================
   SCHEMAS
====================================================== */

const QuestionSchema = z.object({
  question_no: z.number().int().positive().optional(),
  text: z.string().min(1),
  marks: z.number().int().positive().optional(),
  topics: z.array(
    z.object({
      topic_name: z.string(),
      relevance: z.number().min(0).max(1).optional(),
    })
  ),
});

const PYQSchema = z.object({
  questions: z.array(QuestionSchema).min(1),
});

/**
 * Normalizes strings for safe matching.
 */
function normalize(str: string) {
  return str.trim().toLowerCase().replace(/\s+/g, " ");
}

/* ======================================================
   JOB PROGRESS (FAIL HARD)
====================================================== */

async function updateProgress(
  resourceId: string,
  jobId: string,
  stage: string,
  progress: number,
  message: string
) {
  const { error } = await supabaseWorker
    .from("job_progress")
    .upsert(
      {
        resource_id: resourceId,
        job_id: jobId,
        stage,
        progress,
        message,
      },
      { onConflict: "job_id,stage" }
    );

  if (error) {
    throw new Error(`job_progress failed: ${error.message}`);
  }
}

/* ======================================================
   TASK
====================================================== */

export const processPYQTask = task({
  id: "process-pyq",

  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1_000,
    maxTimeoutInMs: 10_000,
  },

  run: async (
    payload: {
      resourceId: string;
      fileUri: string;
      googleFileName: string;
      mimeType: string;
      subjectId: string;
      examType?: string;
    },
    { ctx }
  ) => {
    const {
      resourceId,
      fileUri,
      googleFileName,
      mimeType,
      subjectId,
      examType,
    } = payload;

    const jobId = ctx.run.id;

    /* ---------- VALIDATE EXAM TYPE ---------- */
    const normalizedExamType = examType?.toUpperCase() ?? null;
    if (normalizedExamType && !VALID_EXAM_TYPES.has(normalizedExamType)) {
      throw new Error(`Invalid exam_type: ${examType}`);
    }

    try {
      /* ---------- CLAIM ---------- */
      await updateProgress(resourceId, jobId, "claimed", 5, "Job claimed");

      await supabaseWorker
        .from("resources")
        .update({
          status: "PROCESSING",
          exam_type: normalizedExamType,
        })
        .eq("id", resourceId);

      /* ---------- LOAD TOPICS ---------- */
      await updateProgress(resourceId, jobId, "loading_topics", 10, "Loading topics");

      const { data: subjectConfig } = await supabaseWorker
        .from("subjects")
        .select("id")
        .eq("id", subjectId)
        .single();

      if (!subjectConfig) {
        throw new Error("Subject not found");
      }

      // Fetch all topics for this subject to build the resolveChildTopicIds input
      // In PYQ, we usually want to score against the ENTIRE syllabus by default
      const { data: allParentTopics } = await supabaseWorker
        .from("topics")
        .select("id")
        .eq("subject_id", subjectId)
        .is("parent_topic_id", null);

      const scopeEntries = (allParentTopics ?? []).map(t => ({
        topic_id: t.id,
        selected_sub_topics: null,
      }));

      const childTopicIds = await resolveChildTopicIds(supabaseWorker, scopeEntries);

      if (childTopicIds.length === 0) {
        throw new Error("No child topics found after resolution");
      }

      const { data: childTopics } = await supabaseWorker
        .from("topics")
        .select("id, name, parent_topic_id")
        .in("id", childTopicIds);

      if (!childTopics?.length) {
        throw new Error("No child topics found in database");
      }

      // Fetch parent names for "Parent > Child" format
      const parentIdsFromChildren = [
        ...new Set(
          childTopics
            .filter(t => t.parent_topic_id)
            .map(t => t.parent_topic_id as string)
        ),
      ];

      let parentNameMap = new Map<string, string>();
      if (parentIdsFromChildren.length > 0) {
        const { data: parents } = await supabaseWorker
          .from("topics")
          .select("id, name")
          .in("id", parentIdsFromChildren);
        parentNameMap = new Map((parents ?? []).map(p => [p.id, p.name]));
      }

      const topicMap = new Map(
        childTopics.map(t => [normalize(t.name), t.id])
      );

      // Expanded topic list for AI: prefer sub-topic granularity
      const expandedLines: string[] = childTopics.map(t => {
        const parentName = t.parent_topic_id
          ? parentNameMap.get(t.parent_topic_id)
          : null;
        return parentName ? `${parentName} > ${t.name}` : t.name;
      });

      const topicList = expandedLines
        .map((line, i) => `${i + 1}. ${line}`)
        .join("\n");

      logger.info(`Loaded ${childTopics.length} child topics for matching`);

      /* ---------- WAIT FOR GOOGLE FILE ---------- */
      await updateProgress(resourceId, jobId, "waiting", 15, "Waiting for file");

      const file = await getGenAI().files.get({ name: googleFileName });
      if (file.state !== "ACTIVE") {
        throw new Error("Google file not ready");
      }

      /* ---------- AI EXTRACTION ---------- */
      // Fallback strategy:
      // 1. Try Flagship model (31b) - high quality
      // 2. Fallback to Speed model (26b MoE) if overloaded or failed
      await updateProgress(resourceId, jobId, "extracting", 30, "Extracting PYQs...");

      const contentsPayload = [
        {
          role: "user",
          parts: [
            { fileData: { fileUri, mimeType } },
            { text: buildPYQExtractionPrompt({ topicList }) },
          ],
        },
      ];

      let result;
      let modelUsed = GEMINI_MODEL_QUESTIONS;

      try {
        result = await getGenAI().models.generateContent({
          model: GEMINI_MODEL_QUESTIONS,
          contents: contentsPayload,
          config: {
            ...getThinkingConfig(GEMINI_MODEL_QUESTIONS),
            maxOutputTokens: 16_384,
          },
        });
      } catch (err: any) {
        logger.warn("[PYQ] Primary model failed, trying fallback", {
          model: GEMINI_MODEL_QUESTIONS,
          error: err.message,
        });

        modelUsed = AI_BACKUP_MODEL;
        result = await getGenAI().models.generateContent({
          model: AI_BACKUP_MODEL,
          contents: contentsPayload,
          config: {
            ...getThinkingConfig(AI_BACKUP_MODEL),
            maxOutputTokens: 16_384,
          },
        });
      }

      logger.info("[PYQ] AI extraction complete", { model: modelUsed });

      const text =
        result.candidates?.[0]?.content?.parts
          ?.map((p: any) => p.text ?? "")
          .join("") ?? "";

      if (!text || text.length > MAX_AI_OUTPUT_CHARS) {
        throw new Error("Invalid AI output");
      }

      /* ---------- PARSE ---------- */
      await updateProgress(resourceId, jobId, "parsing", 50, "Parsing output");

      const parsed = PYQSchema.parse(
        JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1))
      );

      /* ---------- SAVE QUESTIONS ---------- */
      await updateProgress(resourceId, jobId, "saving_questions", 65, "Saving questions");

      const { data: questions } = await supabaseWorker
        .from("questions")
        .upsert(
          parsed.questions.map((q: any, i: number) => ({
            subject_id: subjectId,
            resource_id: resourceId,
            question_no: q.question_no ?? i + 1,
            text: q.text,
            marks: q.marks ?? null,
          })),
          { onConflict: "resource_id,question_no" }
        )
        .select("id");

      /* ---------- LINK TOPICS ---------- */
      await updateProgress(resourceId, jobId, "linking_topics", 80, "Linking topics");

      const links: any[] = [];
      parsed.questions.forEach((q: any, i: number) => {
        const qid = questions?.[i]?.id;
        if (!qid) return;

        q.topics.forEach((t: any) => {
          const rawName: string = t.topic_name;

          // Resolution: direct child name match
          let matchedTopicId: string | undefined = topicMap.get(normalize(rawName));

          // If AI returned "Parent > Child" format, extract child part
          if (!matchedTopicId && rawName.includes(" > ")) {
            const childPart = rawName.split(" > ").pop()?.trim();
            if (childPart) matchedTopicId = topicMap.get(normalize(childPart));
          }

          if (matchedTopicId) {
            links.push({
              question_id: qid,
              topic_id: matchedTopicId,
              relevance: t.relevance ?? 1,
            });
          }
        });
      });

      if (links.length) {
        const { error: linkErr } = await supabaseWorker
          .from("question_topics")
          .upsert(links, { onConflict: "question_id,topic_id", ignoreDuplicates: true });
        if (linkErr) throw linkErr;
      }

      /* ---------- COMPLETE ---------- */
      await supabaseWorker
        .from("resources")
        .update({ status: "COMPLETED" })
        .eq("id", resourceId);

      await updateProgress(resourceId, jobId, "completed", 100, "Done");

      try {
        await computeWTFTask.trigger({ subjectId: payload.subjectId });
      } catch (err) {
        logger.warn("Failed to trigger WTF recomputation", { error: err });
      }

      try {
        await getGenAI().files.delete({ name: googleFileName });
      } catch { }

      return { success: true };
    } catch (err: any) {
      const isLastAttempt = ctx.attempt.number >= (ctx.run.maxAttempts ?? 1);
      logger.error("PYQ failed", {
        err,
        attempt: ctx.attempt.number,
        isLastAttempt,
      });

      if (isLastAttempt) {
        await supabaseWorker
          .from("resources")
          .update({ status: "FAILED" })
          .eq("id", resourceId);

        await updateProgress(resourceId, jobId, "failed", 0, err.message);

        try {
          await getGenAI().files.delete({ name: googleFileName });
        } catch { }
      } else {
        logger.info("Skipping cleanup for retry", { nextAttempt: ctx.attempt.number + 1 });
      }

      throw err;
    }
  },
});
