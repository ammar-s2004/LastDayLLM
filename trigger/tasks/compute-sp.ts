import { task, logger, metadata } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";

import { resolveChildTopicIds } from "@/lib/shared/resolve-children";
import { computeSP, type SPModuleInput } from "@/lib/sp";

type ModuleRow = {
  id: string;
  module_no: number;
  title: string;
};

type TopicRow = {
  id: string;
  name: string;
  module_id: string;
  parent_topic_id: string | null;
  sub_topics: unknown;
};

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

export const computeSPTask = task({
  id: "compute-sp",

  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 15000,
  },

  run: async (payload: { subjectId: string; topicIds: string[] }) => {
    const supabase = getSupabaseAdmin();

    logger.info("[compute-sp] Starting", {
      subjectId: payload.subjectId,
      topicCount: payload.topicIds.length,
    });

    if (payload.topicIds.length === 0) {
      logger.warn("[compute-sp] No topic IDs provided, skipping");
      return { success: true, scoredTopics: 0 };
    }

    const scopeEntries = payload.topicIds.map((id) => ({ topic_id: id, selected_sub_topics: null }));
    const childTopicIds = await resolveChildTopicIds(supabase, scopeEntries);

    if (childTopicIds.length === 0) {
      logger.warn("[compute-sp] No child topics found after resolution, skipping");
      return { success: true, scoredTopics: 0 };
    }

    const [
      { data: modules, error: modulesError },
      { data: topics, error: topicsError },
      { data: parentTopics, error: parentTopicsError },
    ] =
      await Promise.all([
        supabase
          .from("modules")
          .select("id, module_no, title")
          .eq("subject_id", payload.subjectId)
          .order("module_no"),
        supabase
          .from("topics")
          .select("id, name, module_id, parent_topic_id, sub_topics")
          .eq("subject_id", payload.subjectId)
          .in("id", childTopicIds),
        supabase
          .from("topics")
          .select("id, name")
          .is("parent_topic_id", null)
          .eq("subject_id", payload.subjectId),
      ]);

    if (modulesError) {
      throw new Error(`[compute-sp] Failed to fetch modules: ${modulesError.message}`);
    }

    if (topicsError) {
      throw new Error(`[compute-sp] Failed to fetch topics: ${topicsError.message}`);
    }

    if (parentTopicsError) {
      throw new Error(`[compute-sp] Failed to fetch parent topics: ${parentTopicsError.message}`);
    }

    const moduleRows = (modules ?? []) as ModuleRow[];
    const topicRows = (topics ?? []) as TopicRow[];
    const parentNameMap = new Map((parentTopics ?? []).map((parent) => [parent.id, parent.name]));

    const moduleMap = new Map(moduleRows.map((module) => [module.id, module]));
    const topicById = new Map(topicRows.map((topic) => [topic.id, topic]));
    const topicsByModule = new Map<string, TopicRow[]>();

    for (const topic of topicRows) {
      const existing = topicsByModule.get(topic.module_id) ?? [];
      existing.push(topic);
      topicsByModule.set(topic.module_id, existing);
    }

    const spModules: SPModuleInput[] = moduleRows
      .map((module) => ({
        moduleNo: module.module_no,
        moduleTitle: module.title,
        topics: (topicsByModule.get(module.id) ?? []).map((topic) => ({
          id: topic.id,
          name: topic.name,
          subtopics: [],
          parentName: topic.parent_topic_id ? parentNameMap.get(topic.parent_topic_id) : undefined,
        })),
      }))
      .filter((module) => module.topics.length > 0);

    const { results, truncated } = await computeSP(spModules);

    if (truncated) {
      logger.warn("[compute-sp] Gemini response was truncated — SP scores may be incomplete");
      metadata.set("truncated", true);
      metadata.set("truncatedWarning", "AI response was cut short — some topic scores may be missing from this run.");
    }

    if (results.length === 0) {
      logger.warn("[compute-sp] No SP scores returned");
      return { success: true, scoredTopics: 0, truncated: false };
    }

    const computedAt = new Date().toISOString();
    const rows = results
      .map((result) => {
        const topic = topicById.get(result.topicId);
        const resolvedModuleId =
          topic?.module_id ??
          [...moduleMap.values()].find((module) => module.module_no === result.moduleNo)?.id;

        if (!resolvedModuleId) {
          logger.warn("[compute-sp] Could not resolve module_id, skipping topic", {
            topicId: result.topicId,
          });
          return null;
        }

        return {
          subject_id: payload.subjectId,
          module_id: resolvedModuleId,
          topic_id: result.topicId,
          centrality_score: Math.min(1.0, Math.max(0.0, result.centralityScore)),
          computed_at: computedAt,
          sp_truncated: truncated,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const { error: upsertError } = await supabase
      .from("topic_sp_scores")
      .upsert(rows, { onConflict: "topic_id" });

    if (upsertError) {
      throw new Error(`[compute-sp] Failed to upsert SP scores: ${upsertError.message}`);
    }

    logger.info("[compute-sp] Completed", {
      subjectId: payload.subjectId,
      scoredTopics: rows.length,
    });

    return {
      success: true,
      scoredTopics: rows.length,
      truncated,
    };
  },
});
