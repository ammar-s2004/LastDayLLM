import type { SupabaseClient } from "@supabase/supabase-js";

import { parseCombinedHints } from "@/lib/hints";
import { getConfidenceScalar } from "@/lib/te/compute";

import type { SubjectContext, TopicData } from "./types";

type TopicRow = {
  id: string;
  module_id: string | null;
  parent_topic_id: string | null;
};

type ModuleRow = {
  id: string;
  module_no: number;
};

type SPRow = {
  topic_id: string;
  centrality_score: number | null;
};

type NCRow = {
  topic_id: string;
  nc_file_score: number | null;
  file_weight: number | null;
};

type WTFRow = {
  topic_id: string;
  wtf_score: number | null;
};

type TERow = {
  topic_id: string;
  te_score: number | null;
};

type ARow = {
  topic_id: string;
  a_score: number | null;
};

type SubjectRow = {
  college_assignment_factor: number | null;
};

type HintRow = {
  hint_text: string | null;
  confidence: string | null;
};

type ResourceRow = {
  resource_type: string;
};

export async function collectSignals(
  supabase: SupabaseClient,
  subjectId: string
): Promise<{
  topics: TopicData[];
  context: SubjectContext;
  moduleMap: Map<string, number>;
}> {
  const [
    topicsResult,
    modulesResult,
    spResult,
    ncResult,
    wtfResult,
    teResult,
    aResult,
    subjectResult,
    hintResult,
    resourcesResult,
  ] = await Promise.all([
    supabase.from("topics").select("id, module_id, parent_topic_id").eq("subject_id", subjectId),
    supabase.from("modules").select("id, module_no").eq("subject_id", subjectId).order("module_no"),
    supabase
      .from("topic_sp_scores")
      .select("topic_id, centrality_score")
      .eq("subject_id", subjectId),
    supabase
      .from("nc_scores")
      .select("topic_id, nc_file_score, file_weight")
      .eq("subject_id", subjectId),
    supabase.from("topic_wtf_scores").select("topic_id, wtf_score").eq("subject_id", subjectId),
    supabase.from("topic_te_scores").select("topic_id, te_score").eq("subject_id", subjectId),
    supabase.from("topic_a_scores").select("topic_id, a_score").eq("subject_id", subjectId),
    supabase
      .from("subjects")
      .select("college_assignment_factor")
      .eq("id", subjectId)
      .single(),
    supabase
      .from("teacher_hints")
      .select("hint_text, confidence")
      .eq("subject_id", subjectId)
      .is("exam_type", null)
      .is("exam_label", null)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("resources")
      .select("resource_type")
      .eq("subject_id", subjectId)
      .in("status", ["COMPLETED", "PARTIAL"]),
  ]);

  if (topicsResult.error) {
    throw new Error(`[collectSignals] Failed to fetch topics: ${topicsResult.error.message}`);
  }

  if (modulesResult.error) {
    throw new Error(`[collectSignals] Failed to fetch modules: ${modulesResult.error.message}`);
  }

  if (spResult.error) {
    throw new Error(`[collectSignals] Failed to fetch SP scores: ${spResult.error.message}`);
  }

  if (ncResult.error) {
    throw new Error(`[collectSignals] Failed to fetch NC scores: ${ncResult.error.message}`);
  }

  if (wtfResult.error) {
    throw new Error(`[collectSignals] Failed to fetch WTF scores: ${wtfResult.error.message}`);
  }

  if (teResult.error) {
    throw new Error(`[collectSignals] Failed to fetch TE scores: ${teResult.error.message}`);
  }

  if (aResult.error) {
    throw new Error(`[collectSignals] Failed to fetch A scores: ${aResult.error.message}`);
  }

  if (subjectResult.error) {
    throw new Error(`[collectSignals] Failed to fetch subject: ${subjectResult.error.message}`);
  }

  if (hintResult.error) {
    throw new Error(`[collectSignals] Failed to fetch teacher hints: ${hintResult.error.message}`);
  }

  if (resourcesResult.error) {
    throw new Error(`[collectSignals] Failed to fetch resources: ${resourcesResult.error.message}`);
  }

  const topicRows = (topicsResult.data ?? []) as TopicRow[];
  const moduleRows = (modulesResult.data ?? []) as ModuleRow[];
  const spRows = (spResult.data ?? []) as SPRow[];
  const ncRows = (ncResult.data ?? []) as NCRow[];
  const wtfRows = (wtfResult.data ?? []) as WTFRow[];
  const teRows = (teResult.data ?? []) as TERow[];
  const aRows = (aResult.data ?? []) as ARow[];
  const subjectRow = subjectResult.data as SubjectRow | null;
  const hintRow = hintResult.data as HintRow | null;
  const resourceRows = (resourcesResult.data ?? []) as ResourceRow[];

  const spMap = new Map(spRows.map((row) => [row.topic_id, row.centrality_score ?? 0]));
  const wtfMap = new Map(wtfRows.map((row) => [row.topic_id, row.wtf_score ?? 0]));
  const teMap = new Map(teRows.map((row) => [row.topic_id, row.te_score ?? 0]));
  const aMap = new Map(aRows.map((row) => [row.topic_id, row.a_score ?? 0]));
  const moduleMap = new Map(moduleRows.map((row) => [row.id, row.module_no]));

  // NC aggregation: best-score + spread bonus (replaces old weighted average)
  const ncByTopic = new Map<string, Array<{ score: number; weight: number }>>();
  for (const row of ncRows) {
    const existing = ncByTopic.get(row.topic_id) ?? [];
    existing.push({ score: row.nc_file_score ?? 0, weight: row.file_weight ?? 0 });
    ncByTopic.set(row.topic_id, existing);
  }

  const ncMap = new Map<string, number>();
  for (const [topicId, entries] of ncByTopic) {
    const weightedScores = entries.map((e) => e.score * e.weight);
    const bestScore = Math.max(...weightedScores);
    const fileCount = entries.length;
    // Spread bonus only applies if best score is meaningful (prevents shallow-spread inflation)
    const spreadBonus = bestScore > 0.4 ? Math.min(0.15, 0.05 * fileCount) : 0;
    const avgBonus = (weightedScores.reduce((a, b) => a + b, 0) / weightedScores.length) * 0.1;
    ncMap.set(topicId, Math.min(1.0, bestScore + spreadBonus + avgBonus));
  }

  const parsedHint = parseCombinedHints(hintRow?.hint_text);
  const hasHints = parsedHint.teacherHints.trim().length > 0;

  const context: SubjectContext = {
    has_papers: resourceRows.some(
      (row) => row.resource_type === "TEST_PAPER" || row.resource_type === "EXAM_PAPER"
    ),
    has_assignments: resourceRows.some((row) => row.resource_type === "ASSIGNMENT"),
    has_hints: hasHints,
    hint_confidence_scalar: hasHints ? getConfidenceScalar(hintRow?.confidence ?? "EXACT") : 1.0,
    college_assignment_factor: subjectRow?.college_assignment_factor ?? 0.0,
  };

  const topics: TopicData[] = [];

  for (const topic of topicRows) {
    if (!topic.module_id) {
      console.warn("[collectSignals] Topic missing module_id, skipping", { topic_id: topic.id });
      continue;
    }

    if (topic.parent_topic_id === null) {
      const hasChildren = topicRows.some((row) => row.parent_topic_id === topic.id);
      if (hasChildren) continue;
    }

    topics.push({
      topic_id: topic.id,
      module_id: topic.module_id,
      signals: {
        SP: spMap.get(topic.id) ?? 0,
        NC: ncMap.get(topic.id) ?? 0,
        WTF: wtfMap.get(topic.id) ?? 0,
        TE: teMap.get(topic.id) ?? 0,
        A: aMap.get(topic.id) ?? 0,
      },
    });
  }

  return { topics, context, moduleMap };
}
