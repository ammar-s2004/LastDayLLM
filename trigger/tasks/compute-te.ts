import { task, logger } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { GEMINI_MODEL_WEIGHTS, GEMINI_MODEL_WEIGHTS_FALLBACK, getThinkingConfig } from "@/lib/ai-limits";
import { buildTEPrompt, type EnrichedTopic } from "@/lib/ai-prompts";
import { parseCombinedHints } from "@/lib/hints";
import {
  computeTE,
  type TEEmphasisInput,
  type TopicModuleInfo,
} from "@/lib/te";
import {
  deriveAllowedLeafTopicIds,
  expandScopeWithChildren,
  type ScopedTopicsByExamType,
} from "@/lib/shared/exam-scope";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

let teGenAIClient: GoogleGenAI | null = null;

function getTEAI(): GoogleGenAI {
  if (!teGenAIClient) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_AI_API_KEY environment variable is not set");
    }

    teGenAIClient = new GoogleGenAI({ apiKey });
  }

  return teGenAIClient;
}

const TEScoreSchema = z.object({
  topic_id: z.string(),
  emphasis_score: z.number(),
  reason: z.string().default(""),
});

const TEResponseSchema = z.object({
  scores: z.array(TEScoreSchema),
});

type TeacherHintRow = {
  hint_text: string;
  confidence: string;
};

type SubjectRow = {
  user_id: string;
};

type TopicRow = {
  id: string;
  name: string;
  module_id: string | null;
  sub_topics: unknown;
};

type ExamScopeRow = {
  id: string;
  exam_type: string;
};

type ExamScopeTopicRow = {
  exam_scope_id: string;
  topic_id: string;
};

type TopicScopeRow = {
  id: string;
  parent_topic_id: string | null;
};

type TopicParentRow = TopicScopeRow;

type NCScoreRow = {
  topic_id: string;
  depth_breakdown: {
    has_derivation?: boolean;
    has_worked_example?: boolean;
    has_diagram?: boolean;
    has_code?: boolean;
  } | null;
};

type WTFScoreRow = {
  topic_id: string;
  wtf_score: number | null;
  question_count: number | null;
};

function parseSubtopics(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (typeof item === "object" && item !== null && typeof (item as { name?: unknown }).name === "string") {
      return [(item as { name: string }).name];
    }
    return [];
  });
}

export const computeTETask = task({
  id: "compute-te",

  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 15000,
  },

  run: async (payload: { subjectId: string }) => {
    const supabase = getSupabaseAdmin();

    logger.info("[compute-te] Starting", {
      subjectId: payload.subjectId,
    });

    const { data: teacherHint, error: teacherHintError } = await supabase
      .from("teacher_hints")
      .select("hint_text, confidence")
      .eq("subject_id", payload.subjectId)
      .is("exam_type", null)
      .is("exam_label", null)
      .limit(1)
      .maybeSingle();

    if (teacherHintError) {
      throw new Error(`[compute-te] Failed to fetch teacher hints: ${teacherHintError.message}`);
    }

    const { data: topics, error: topicsError } = await supabase
      .from("topics")
      .select("id, name, module_id, sub_topics")
      .eq("subject_id", payload.subjectId);

    if (topicsError) {
      throw new Error(`[compute-te] Failed to fetch topics: ${topicsError.message}`);
    }

    const { data: subject, error: subjectError } = await supabase
      .from("subjects")
      .select("user_id")
      .eq("id", payload.subjectId)
      .single();

    if (subjectError || !subject) {
      throw new Error(`[compute-te] Failed to fetch subject: ${subjectError?.message ?? "Not found"}`);
    }

    const { data: allTopics, error: allTopicsError } = await supabase
      .from("topics")
      .select("id, parent_topic_id")
      .eq("subject_id", payload.subjectId);

    if (allTopicsError) {
      throw new Error(`[compute-te] Failed to fetch topic parents: ${allTopicsError.message}`);
    }

    const { data: scopes, error: scopesError } = await supabase
      .from("exam_scopes")
      .select("id, exam_type")
      .eq("subject_id", payload.subjectId)
      .eq("user_id", (subject as SubjectRow).user_id);

    if (scopesError) {
      throw new Error(`[compute-te] Failed to fetch exam scopes: ${scopesError.message}`);
    }

    const scopeRows = (scopes ?? []) as ExamScopeRow[];
    const scopeIds = scopeRows.map((scope) => scope.id);

    let scopeTopicRows: ExamScopeTopicRow[] = [];
    if (scopeIds.length > 0) {
      const { data: scopeTopics, error: scopeTopicsError } = await supabase
        .from("exam_scope_topics")
        .select("exam_scope_id, topic_id")
        .in("exam_scope_id", scopeIds);

      if (scopeTopicsError) {
        throw new Error(`[compute-te] Failed to fetch exam scope topics: ${scopeTopicsError.message}`);
      }

      scopeTopicRows = (scopeTopics ?? []) as ExamScopeTopicRow[];
    }

    const scopeTypeById = new Map(scopeRows.map((scope) => [scope.id, scope.exam_type.trim().toUpperCase()]));
    const scopedTopicsByExamType: ScopedTopicsByExamType = new Map();

    for (const row of scopeTopicRows) {
      const examType = scopeTypeById.get(row.exam_scope_id);
      if (!examType) continue;

      const existing = scopedTopicsByExamType.get(examType) ?? new Set<string>();
      existing.add(row.topic_id);
      scopedTopicsByExamType.set(examType, existing);
    }

    const childToParentMap = new Map<string, string>();
    for (const topic of (allTopics ?? []) as TopicParentRow[]) {
      if (topic.parent_topic_id) {
        childToParentMap.set(topic.id, topic.parent_topic_id);
      }
    }

    const expandedScopedTopics = expandScopeWithChildren(scopedTopicsByExamType, childToParentMap);
    const rawScopeParentIds = new Set(
      Array.from(scopedTopicsByExamType.values()).flatMap((topicIds) => Array.from(topicIds))
    );
    const allowedTopicIds = deriveAllowedLeafTopicIds(rawScopeParentIds, (allTopics ?? []) as TopicParentRow[]);

    const topicRows = (topics ?? []) as TopicRow[];
    const effectiveTopicRows =
      allowedTopicIds && allowedTopicIds.size > 0
        ? topicRows.filter((topic) => allowedTopicIds.has(topic.id))
        : topicRows;
    const topicInfos: TopicModuleInfo[] = effectiveTopicRows.map((topic) => ({
      topic_id: topic.id,
      module_id: topic.module_id,
    }));

    const parsedHints = parseCombinedHints((teacherHint as TeacherHintRow | null)?.hint_text);
    const hintText = parsedHints.teacherHints.trim();
    const confidence = (teacherHint as TeacherHintRow | null)?.confidence ?? "EXACT";

    if (!hintText) {
      const zeroRows = computeTE([], confidence, topicInfos, allowedTopicIds).map((result) => ({
        subject_id: payload.subjectId,
        module_id: result.module_id,
        topic_id: result.topic_id,
        te_score: result.te_score,
        te_raw: result.te_raw,
        reason: result.reason,
        computed_at: new Date().toISOString(),
      }));

      if (zeroRows.length > 0) {
        const { error: upsertError } = await supabase
          .from("topic_te_scores")
          .upsert(zeroRows, { onConflict: "topic_id" });

        if (upsertError) {
          throw new Error(`[compute-te] Failed to upsert zero TE scores: ${upsertError.message}`);
        }
      }

      logger.info("[compute-te] Empty hint text, stored zero TE scores", {
        subjectId: payload.subjectId,
        scoredTopics: zeroRows.length,
      });

      return {
        success: true,
        scoredTopics: zeroRows.length,
        usedLLM: false,
      };
    }

    const topicIds = effectiveTopicRows.map((topic) => topic.id);

    let ncScoreRows: NCScoreRow[] = [];
    if (topicIds.length > 0) {
      const { data: ncScores, error: ncScoresError } = await supabase
        .from("nc_scores")
        .select("topic_id, depth_breakdown")
        .eq("subject_id", payload.subjectId)
        .in("topic_id", topicIds);

      if (ncScoresError) {
        throw new Error(`[compute-te] Failed to fetch NC scores: ${ncScoresError.message}`);
      }

      ncScoreRows = (ncScores ?? []) as NCScoreRow[];
    }

    const ncAggregate = new Map<
      string,
      {
        has_derivation: boolean;
        has_worked_example: boolean;
        has_diagram: boolean;
        has_code: boolean;
      }
    >();

    for (const row of ncScoreRows) {
      const existing = ncAggregate.get(row.topic_id) ?? {
        has_derivation: false,
        has_worked_example: false,
        has_diagram: false,
        has_code: false,
      };

      existing.has_derivation = existing.has_derivation || Boolean(row.depth_breakdown?.has_derivation);
      existing.has_worked_example = existing.has_worked_example || Boolean(row.depth_breakdown?.has_worked_example);
      existing.has_diagram = existing.has_diagram || Boolean(row.depth_breakdown?.has_diagram);
      existing.has_code = existing.has_code || Boolean(row.depth_breakdown?.has_code);

      ncAggregate.set(row.topic_id, existing);
    }

    let wtfRows: WTFScoreRow[] = [];
    if (topicIds.length > 0) {
      const { data: wtfScores, error: wtfScoresError } = await supabase
        .from("topic_wtf_scores")
        .select("topic_id, wtf_score, question_count")
        .eq("subject_id", payload.subjectId)
        .in("topic_id", topicIds);

      if (wtfScoresError) {
        throw new Error(`[compute-te] Failed to fetch WTF scores: ${wtfScoresError.message}`);
      }

      wtfRows = (wtfScores ?? []) as WTFScoreRow[];
    }

    const wtfByTopic = new Map(
      wtfRows.map((row) => [
        row.topic_id,
        {
          wtf_score: row.wtf_score ?? 0,
          question_count: row.question_count ?? 0,
        },
      ])
    );

    const enrichedTopics: EnrichedTopic[] = effectiveTopicRows.map((topic) => {
      const nc = ncAggregate.get(topic.id) ?? {
        has_derivation: false,
        has_worked_example: false,
        has_diagram: false,
        has_code: false,
      };
      const wtf = wtfByTopic.get(topic.id) ?? { wtf_score: 0, question_count: 0 };

      return {
        topic_id: topic.id,
        name: topic.name,
        subtopics: parseSubtopics(topic.sub_topics),
        has_derivation: nc.has_derivation,
        has_worked_example: nc.has_worked_example,
        has_diagram: nc.has_diagram,
        has_code: nc.has_code,
        wtf_score: wtf.wtf_score,
        question_count: wtf.question_count,
      };
    });

    const prompt = buildTEPrompt(hintText, enrichedTopics);
    const ai = getTEAI();

    let response;
    try {
      response = await ai.models.generateContent({
        model: GEMINI_MODEL_WEIGHTS,
        contents: prompt,
        config: {
          ...getThinkingConfig(GEMINI_MODEL_WEIGHTS),
          responseMimeType: "application/json",
          temperature: 0.2,
          maxOutputTokens: 4096,
        },
      });
    } catch (err: any) {
      logger.warn("[compute-te] Primary model failed, trying fallback", { error: err.message });
      response = await ai.models.generateContent({
        model: GEMINI_MODEL_WEIGHTS_FALLBACK,
        contents: prompt,
        config: {
          ...getThinkingConfig(GEMINI_MODEL_WEIGHTS_FALLBACK),
          responseMimeType: "application/json",
          temperature: 0.2,
          maxOutputTokens: 4096,
        },
      });
    }

    if (!response.text) {
      throw new Error("[compute-te] No text in response from Gemini.");
    }

    const parsed = TEResponseSchema.parse(JSON.parse(response.text));
    const validTopicIds = new Set(effectiveTopicRows.map((topic) => topic.id));

    const emphasisInputs: TEEmphasisInput[] = parsed.scores
      .filter((score) => validTopicIds.has(score.topic_id))
      .map((score) => ({
        topic_id: score.topic_id,
        emphasis_score: Math.min(1, Math.max(0, score.emphasis_score)),
        reason: score.reason,
      }));

    const results = computeTE(emphasisInputs, confidence, topicInfos, allowedTopicIds);
    const computedAt = new Date().toISOString();
    const rows = results.map((result) => ({
      subject_id: payload.subjectId,
      module_id: result.module_id,
      topic_id: result.topic_id,
      te_score: result.te_score,
      te_raw: result.te_raw,
      reason: result.reason,
      computed_at: computedAt,
    }));

    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from("topic_te_scores")
        .upsert(rows, { onConflict: "topic_id" });

      if (upsertError) {
        throw new Error(`[compute-te] Failed to upsert TE scores: ${upsertError.message}`);
      }
    }

    logger.info("[compute-te] Completed", {
      subjectId: payload.subjectId,
      scoredTopics: rows.length,
    });

    return {
      success: true,
      scoredTopics: rows.length,
      usedLLM: true,
    };
  },
});
