import { task, logger } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";

import { collectSignals } from "@/lib/etsm/collect";
import { ETSMFusionEngine } from "@/lib/etsm/engine";
import type { ScoredTopic } from "@/lib/etsm/types";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

export const runPredictionTask = task({
  id: "run-prediction",

  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 15000,
  },

  run: async (payload: {
    subjectId: string;
    userId: string;
    examType?: string;
    examLabel?: string;
    moduleNos?: number[];
  }) => {
    const supabase = getSupabaseAdmin();

    logger.info("[run-prediction] Starting", {
      subjectId: payload.subjectId,
    });

    const { topics, context, moduleMap } = await collectSignals(supabase, payload.subjectId);

    const filteredTopics = payload.moduleNos?.length
      ? topics.filter((topic) => {
          const moduleNo = moduleMap.get(topic.module_id);
          return moduleNo !== undefined && payload.moduleNos?.includes(moduleNo);
        })
      : topics;

    const modulesInScope = payload.moduleNos?.length
      ? payload.moduleNos
      : [...new Set([...moduleMap.values()])];

    const grouped = new Map<string, typeof filteredTopics>();
    for (const topic of filteredTopics) {
      const existing = grouped.get(topic.module_id) ?? [];
      existing.push(topic);
      grouped.set(topic.module_id, existing);
    }

    const engine = new ETSMFusionEngine();
    const allScored: ScoredTopic[] = [];

    for (const [, moduleTopics] of grouped) {
      const ranked = engine.rankModule(moduleTopics, context);
      allScored.push(...ranked);
    }

    const { data: predictionRun, error: predictionRunError } = await supabase
      .from("prediction_runs")
      .insert({
        subject_id: payload.subjectId,
        user_id: payload.userId,
        exam_type: payload.examType ?? null,
        exam_label: payload.examLabel ?? null,
        modules_in_scope: modulesInScope,
      })
      .select("id")
      .single();

    if (predictionRunError || !predictionRun) {
      throw new Error(
        `[run-prediction] Failed to create prediction run: ${predictionRunError?.message ?? "Not found"}`
      );
    }

    const predictionRunId = predictionRun.id;

    if (allScored.length > 0) {
      const { error: scoresError } = await supabase.from("prediction_topic_scores").insert(
        allScored.map((score) => ({
          prediction_run_id: predictionRunId,
          topic_id: score.topic_id,
          p_prior: score.signals.SP,
          e_notes: score.signals.NC,
          f_tests: score.signals.WTF,
          e_teacher: score.signals.TE,
          f_assign: score.signals.A,
          base_score: score.base_score,
          synergy_score: score.synergy_bonus,
          teacher_floor: score.teacher_floor_applied,
          final_score: score.final_score,
          band: score.band,
        }))
      );

      if (scoresError) {
        throw new Error(`[run-prediction] Failed to insert topic scores: ${scoresError.message}`);
      }
    }

    logger.info("[run-prediction] Completed", {
      subjectId: payload.subjectId,
      topicsScored: allScored.length,
      modulesProcessed: [...grouped.keys()].length,
    });

    return {
      success: true,
      predictionRunId,
      topicsScored: allScored.length,
    };
  },
});
