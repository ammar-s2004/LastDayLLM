import { task, logger } from "@trigger.dev/sdk";
import { supabaseWorker } from "@/lib/supabase-worker";
import { z } from "zod";
import { GEMINI_MODEL_SYLLABUS, SYLLABUS_BACKUP_MODEL, getThinkingConfig } from "@/lib/ai-limits";
import { SYLLABUS_EXTRACTION_PROMPT } from "@/lib/ai-prompts";

// Lazy-loaded Google AI client
let _genAI: any = null;
function getGenAI() {
  if (!_genAI) {
    const { GoogleGenAI } = require("@google/genai");
    _genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });
  }
  return _genAI;
}

const FILE_READY_TIMEOUT_MS = 20_000;
const FILE_READY_POLL_MS = 1_000;

const STAGE = {
  CLAIMED: "claimed",
  WAITING: "waiting",
  EXTRACTING: "extracting",
  SAVING: "saving",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

const TopicSchema = z.object({
  name: z.string().min(1),
  sub_topics: z.array(z.string().min(1)).default([]),
});

const ModuleSchema = z.object({
  module_no: z.number().int().positive(),
  title: z.string().min(1),
  topics: z.array(TopicSchema).min(1),
  hours: z.coerce.number().optional(),
});

const SyllabusSchema = z.object({
  modules: z.array(ModuleSchema).min(1),
});

async function updateProgress(resourceId: string, jobId: string, stage: string, progress: number, message: string) {
  const { error } = await supabaseWorker
    .from("job_progress")
    .upsert(
      { resource_id: resourceId, job_id: jobId, stage, progress, message },
      { onConflict: "job_id,stage" }
    );
  if (error) throw error;
}

async function waitForGoogleFile(name: string) {
  const start = Date.now();
  while (true) {
    const file = await getGenAI().files.get({ name });
    if (file.state === "ACTIVE") return;
    if (Date.now() - start > FILE_READY_TIMEOUT_MS) {
      logger.warn("Google file not ACTIVE, continuing anyway");
      return;
    }
    await new Promise((r) => setTimeout(r, FILE_READY_POLL_MS));
  }
}

export const processSyllabusTask = task({
  id: "process-syllabus",

  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },

  run: async (
    payload: {
      resourceId: string;
      fileUri: string;
      googleFileName: string;
      mimeType: string;
      documentType: string;
      subjectId: string;
      files?: Array<{ uri: string; googleFileName: string; mimeType: string }>;
    },
    { ctx }
  ) => {
    const { resourceId, fileUri, googleFileName, mimeType, documentType, subjectId, files } = payload;
    const jobId = ctx.run.id;
    const normalizedType = String(documentType).trim().toUpperCase();

    try {
      await supabaseWorker.from("resources").update({ status: "PROCESSING" }).eq("id", resourceId);
      await updateProgress(resourceId, jobId, STAGE.CLAIMED, 5, "Job claimed");

      if (normalizedType !== "SYLLABUS") {
        await supabaseWorker.from("resources").update({ status: "COMPLETED" }).eq("id", resourceId);
        await updateProgress(resourceId, jobId, STAGE.COMPLETED, 100, "Non-syllabus document");
        if (files && files.length > 0) {
          for (const f of files) await getGenAI().files.delete({ name: f.googleFileName });
        } else {
          await getGenAI().files.delete({ name: googleFileName });
        }
        return { success: true };
      }

      await updateProgress(resourceId, jobId, STAGE.WAITING, 15, "Waiting for file(s)");

      if (files && files.length > 0) {
        for (const f of files) await waitForGoogleFile(f.googleFileName);
      } else {
        await waitForGoogleFile(googleFileName);
      }

      await updateProgress(resourceId, jobId, STAGE.EXTRACTING, 40, "Extracting syllabus via AI");

      const contentsPayload = [
        {
          role: "user",
          parts: [
            ...(files && files.length > 0
              ? files.map((f) => ({ fileData: { fileUri: f.uri, mimeType: f.mimeType } }))
              : [{ fileData: { fileUri, mimeType } }]),
            { text: SYLLABUS_EXTRACTION_PROMPT },
          ],
        },
      ];

      let result;
      let modelUsed = GEMINI_MODEL_SYLLABUS;

      try {
        result = await getGenAI().models.generateContent({
          model: GEMINI_MODEL_SYLLABUS,
          contents: contentsPayload,
          config: getThinkingConfig(GEMINI_MODEL_SYLLABUS),
        });
      } catch (err: any) {
        logger.warn("[Syllabus] Primary model failed, trying fallback", { model: GEMINI_MODEL_SYLLABUS, error: err.message });
        modelUsed = SYLLABUS_BACKUP_MODEL;
        result = await getGenAI().models.generateContent({
          model: SYLLABUS_BACKUP_MODEL,
          contents: contentsPayload,
          config: getThinkingConfig(SYLLABUS_BACKUP_MODEL),
        });
      }

      const rawText = result.text ?? "";
      const finishReason = result.candidates?.[0]?.finishReason;
      logger.info("[Syllabus] AI extraction finished", { model: modelUsed, textLength: rawText.length, finishReason });

      if (!rawText) throw new Error("Empty AI response from Gemma");

      const start = rawText.indexOf("{");
      const end = rawText.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error(`Invalid JSON output: ${rawText.slice(0, 100)}...`);

      const parsed = JSON.parse(rawText.slice(start, end + 1));
      const validated = SyllabusSchema.parse(parsed);
      if (!validated.modules?.length) throw new Error("Syllabus extraction returned no modules.");

      await updateProgress(resourceId, jobId, STAGE.SAVING, 70, "Saving syllabus");

      const modulesPayload = validated.modules.map((mod) => ({
        module_no: mod.module_no,
        title: mod.title,
        topics: mod.topics.map((t, index) => ({
          name: t.name,
          topic_no: index + 1,
          is_core: false,
          sub_topics: t.sub_topics,
        })),
      }));

      const { error: rpcError } = await supabaseWorker.rpc("save_all_modules_atomic" as any, {
        p_subject_id: subjectId,
        p_modules: modulesPayload,
      } as any);

      if (rpcError) throw rpcError;

      await supabaseWorker.from("resources").update({ status: "COMPLETED" }).eq("id", resourceId);
      await updateProgress(resourceId, jobId, STAGE.COMPLETED, 100, "Processing completed");

      if (files && files.length > 0) {
        for (const f of files) {
          try { await getGenAI().files.delete({ name: f.googleFileName }); }
          catch (e) { logger.warn("[Syllabus] Could not delete Google file (non-fatal)", { name: f.googleFileName }); }
        }
      } else {
        try { await getGenAI().files.delete({ name: googleFileName }); }
        catch (e) { logger.warn("[Syllabus] Could not delete Google file (non-fatal)", { name: googleFileName }); }
      }

      return { success: true };
    } catch (error: any) {
      await supabaseWorker.from("resources").update({ status: "FAILED" }).eq("id", resourceId);
      await updateProgress(resourceId, jobId, STAGE.FAILED, 100, `Failed: ${error.message}`);

      const maxAttempts = ctx.run.maxAttempts ?? 1;
      if (ctx.attempt.number >= maxAttempts) {
        try {
          if (files && files.length > 0) {
            for (const f of files) await getGenAI().files.delete({ name: f.googleFileName });
          } else {
            await getGenAI().files.delete({ name: googleFileName });
          }
        } catch { }
      }

      throw error;
    }
  },
});
