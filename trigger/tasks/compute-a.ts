import { task, logger } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";

import { computeA, type AssignmentMeta, type AssignmentQuestion, type QuestionTopicLink } from "@/lib/a";
import {
  deriveAllowedLeafTopicIds,
  expandScopeWithChildren,
  type ScopedTopicsByExamType,
  type TopicInfo,
} from "@/lib/shared/exam-scope";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

type SubjectRow = {
  user_id: string;
};

type ResourceRow = {
  id: string;
  detected_exam_type: string | null;
  exam_type?: string | null;
};

type QuestionRow = {
  id: string;
  resource_id: string;
};

type QuestionTopicRow = {
  question_id: string;
  topic_id: string;
  relevance: number | null;
};

type TopicRow = {
  id: string;
  module_id: string | null;
  parent_topic_id: string | null;
};

type ExamScopeRow = {
  id: string;
  exam_type: string;
};

type ExamScopeTopicRow = {
  exam_scope_id: string;
  topic_id: string;
};

export const computeATask = task({
  id: "compute-a",

  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 15000,
  },

  run: async (payload: { subjectId: string }) => {
    const supabase = getSupabaseAdmin();

    logger.info("[compute-a] Starting", {
      subjectId: payload.subjectId,
    });

    const { data: subject, error: subjectError } = await supabase
      .from("subjects")
      .select("user_id")
      .eq("id", payload.subjectId)
      .single();

    if (subjectError || !subject) {
      throw new Error(`[compute-a] Failed to fetch subject: ${subjectError?.message ?? "Not found"}`);
    }

    const { data: resources, error: resourcesError } = await supabase
      .from("resources")
      .select("id, detected_exam_type, exam_type")
      .eq("subject_id", payload.subjectId)
      .in("resource_type", ["ASSIGNMENT"])
      .in("status", ["COMPLETED", "PARTIAL"]);

    if (resourcesError) {
      throw new Error(`[compute-a] Failed to fetch assignment resources: ${resourcesError.message}`);
    }

    const resourceRows = (resources ?? []) as ResourceRow[];
    const resourceIds = resourceRows.map((resource) => resource.id);

    let questionRows: QuestionRow[] = [];
    let linkRows: QuestionTopicRow[] = [];

    if (resourceIds.length > 0) {
      const { data: questions, error: questionsError } = await supabase
        .from("questions")
        .select("id, resource_id")
        .eq("subject_id", payload.subjectId)
        .in("resource_id", resourceIds);

      if (questionsError) {
        throw new Error(`[compute-a] Failed to fetch questions: ${questionsError.message}`);
      }

      questionRows = (questions ?? []) as QuestionRow[];
      const questionIds = questionRows.map((question) => question.id);

      if (questionIds.length > 0) {
        const { data: questionTopics, error: linksError } = await supabase
          .from("question_topics")
          .select("question_id, topic_id, relevance")
          .in("question_id", questionIds);

        if (linksError) {
          throw new Error(`[compute-a] Failed to fetch question topics: ${linksError.message}`);
        }

        linkRows = (questionTopics ?? []) as QuestionTopicRow[];
      }
    }

    const { data: topics, error: topicsError } = await supabase
      .from("topics")
      .select("id, module_id, parent_topic_id")
      .eq("subject_id", payload.subjectId);

    if (topicsError) {
      throw new Error(`[compute-a] Failed to fetch topics: ${topicsError.message}`);
    }

    const { data: scopes, error: scopesError } = await supabase
      .from("exam_scopes")
      .select("id, exam_type")
      .eq("subject_id", payload.subjectId)
      .eq("user_id", (subject as SubjectRow).user_id);

    if (scopesError) {
      throw new Error(`[compute-a] Failed to fetch exam scopes: ${scopesError.message}`);
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
        throw new Error(`[compute-a] Failed to fetch exam scope topics: ${scopeTopicsError.message}`);
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

    // Build child->parent mapping
    const childToParentMap = new Map<string, string>();
    for (const topic of (topics ?? []) as TopicRow[]) {
      if (topic.parent_topic_id) {
        childToParentMap.set(topic.id, topic.parent_topic_id);
      }
    }

    // Expand scope to include children of scoped parents
    const expandedScopedTopics = expandScopeWithChildren(
      scopedTopicsByExamType,
      childToParentMap
    );
    const rawScopeParentIds = new Set(
      Array.from(scopedTopicsByExamType.values()).flatMap((topicIds) => Array.from(topicIds))
    );
    const allowedTopicIds = deriveAllowedLeafTopicIds(rawScopeParentIds, (topics ?? []) as TopicRow[]);

    const assignmentsInput: AssignmentMeta[] = resourceRows.map((resource) => ({
      resource_id: resource.id,
      detected_exam_type: resource.detected_exam_type ?? resource.exam_type ?? null,
    }));

    const questionsInput: AssignmentQuestion[] = questionRows.map((question) => ({
      question_id: question.id,
      resource_id: question.resource_id,
    }));

    const linksInput: QuestionTopicLink[] = linkRows.map((link) => ({
      question_id: link.question_id,
      topic_id: link.topic_id,
      relevance: typeof link.relevance === "number" ? link.relevance : 1,
    }));

    const topicsInput: TopicInfo[] = ((topics ?? []) as TopicRow[]).map((topic) => ({
      topic_id: topic.id,
      module_id: topic.module_id,
    }));

    const results = computeA(
      questionsInput,
      linksInput,
      assignmentsInput,
      topicsInput,
      expandedScopedTopics,
      allowedTopicIds
    );

    const computedAt = new Date().toISOString();
    const rows = results.map((result) => ({
      subject_id: payload.subjectId,
      module_id: result.module_id,
      topic_id: result.topic_id,
      a_score: result.a_score,
      a_raw: result.a_raw,
      assignment_count: result.assignment_count,
      computed_at: computedAt,
    }));

    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from("topic_a_scores")
        .upsert(rows, { onConflict: "topic_id" });

      if (upsertError) {
        throw new Error(`[compute-a] Failed to upsert A scores: ${upsertError.message}`);
      }
    }

    logger.info("[compute-a] Completed", {
      subjectId: payload.subjectId,
      assignmentCount: assignmentsInput.length,
      scoredTopics: rows.length,
    });

    return {
      success: true,
      scoredTopics: rows.length,
      assignmentCount: assignmentsInput.length,
    };
  },
});
