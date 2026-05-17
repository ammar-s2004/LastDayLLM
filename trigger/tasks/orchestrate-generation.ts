import { task, logger, wait } from "@trigger.dev/sdk";

import { supabaseWorker } from "@/lib/supabase-worker";
import { generateQuestionsTask } from "./generate-questions";
import { generateAnswersTask } from "./generate-answers";

export const orchestrateGenerationTask = task({
  id: "orchestrate-generation",
  // Long-running: all question gen + 60s wait + (N modules × ~80s each)
  maxDuration: 3600, // 1 hour ceiling
  run: async (payload: {
    subjectId: string;
    userId: string;
    moduleIds: string[];
    predictionRunId: string;
    totalModulesInScope: number;
  }) => {
    const { subjectId, userId, moduleIds, predictionRunId, totalModulesInScope } = payload;

    logger.info("[orchestrate-generation] Starting", {
      subjectId,
      predictionRunId,
      modules: moduleIds.length,
    });

    // ── STEP 1: Generate questions for all modules in parallel ──────────────
    logger.info("[orchestrate-generation] Triggering question generation for all modules in parallel");

    const questionResults = await generateQuestionsTask.batchTriggerAndWait(
      moduleIds.map((moduleId) => ({
        payload: {
          subjectId,
          userId,
          moduleId,
          predictionRunId,
          totalModulesInScope,
        },
      }))
    );

    const failedModules = questionResults.runs.filter((r) => !r.ok);
    if (failedModules.length > 0) {
      logger.warn("[orchestrate-generation] Some question tasks failed", {
        failed: failedModules.length,
        total: moduleIds.length,
      });
    }

    logger.info("[orchestrate-generation] All question tasks finished", {
      succeeded: questionResults.runs.filter((r) => r.ok).length,
      failed: failedModules.length,
    });

    // ── STEP 2: Wait 60s once — AI Studio rate limit buffer ────────────────
    logger.info("[orchestrate-generation] Waiting 60s before starting answer generation");
    await wait.for({ minutes: 1 });

    // ── STEP 3: Fetch collegeId once for answer tasks ──────────────────────
    const { data: profile } = await supabaseWorker
      .from("profiles")
      .select("college_id")
      .eq("id", userId)
      .maybeSingle();

    const collegeId = profile?.college_id ?? null;

    // ── STEP 4: Generate answers for each module one by one ─────────────────
    // Only process modules whose questions succeeded
    const succeededModuleIds = questionResults.runs
      .map((r, i) => (r.ok ? moduleIds[i] : null))
      .filter((id): id is string => id !== null);

    for (let i = 0; i < succeededModuleIds.length; i++) {
      const moduleId = succeededModuleIds[i];

      logger.info(`[orchestrate-generation] Generating answers for module ${i + 1}/${succeededModuleIds.length}`, {
        moduleId,
      });

      await generateAnswersTask.triggerAndWait({
        subjectId,
        userId,
        moduleId,
        predictionRunId,
        collegeId,
      });

      // 40s gap between modules (skip after the last one)
      if (i < succeededModuleIds.length - 1) {
        logger.info(`[orchestrate-generation] Waiting 40s before next module`);
        await wait.for({ seconds: 40 });
      }
    }

    logger.info("[orchestrate-generation] Completed", {
      subjectId,
      predictionRunId,
      modulesProcessed: succeededModuleIds.length,
    });

    return {
      success: true,
      modulesProcessed: succeededModuleIds.length,
      modulesFailed: failedModules.length,
    };
  },
});
