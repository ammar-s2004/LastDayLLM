import { getScopeKeyForExamType, isTTType, type TopicInfo, type ScopedTopicsByExamType } from "@/lib/shared/exam-scope";

export interface AssignmentQuestion {
  question_id: string;
  resource_id: string;
}

export interface QuestionTopicLink {
  question_id: string;
  topic_id: string;
  relevance: number;
}

export interface AssignmentMeta {
  resource_id: string;
  detected_exam_type: string | null;
}

export interface AResult {
  topic_id: string;
  module_id: string | null;
  a_score: number;
  a_raw: number;
  assignment_count: number;
}

export function computeA(
  assignmentQuestions: AssignmentQuestion[],
  questionTopicLinks: QuestionTopicLink[],
  assignments: AssignmentMeta[],
  topics: TopicInfo[],
  scopedTopicsByExamType: ScopedTopicsByExamType,
  allowedTopicIds?: Set<string>
): AResult[] {
  const assignmentById = new Map(assignments.map((assignment) => [assignment.resource_id, assignment]));
  const questionById = new Map(assignmentQuestions.map((question) => [question.question_id, question]));
  const effectiveTopics =
    allowedTopicIds && allowedTopicIds.size > 0
      ? topics.filter((topic) => allowedTopicIds.has(topic.topic_id))
      : topics;

  const topicAssignments = new Map<string, Set<string>>();
  for (const topic of effectiveTopics) {
    topicAssignments.set(topic.topic_id, new Set<string>());
  }

  for (const link of questionTopicLinks) {
    if (link.relevance < 0.4) {
      continue;
    }

    const question = questionById.get(link.question_id);
    if (!question) {
      continue;
    }

    const assignment = assignmentById.get(question.resource_id);
    if (!assignment) {
      continue;
    }

    const scopeKey = getScopeKeyForExamType(assignment.detected_exam_type);
    const scopedTopics = scopeKey ? scopedTopicsByExamType.get(scopeKey) : undefined;
    const applyScopeGate = isTTType(assignment.detected_exam_type) && scopedTopics instanceof Set;

    if (applyScopeGate && !scopedTopics?.has(link.topic_id)) {
      continue;
    }

    const assignmentIds = topicAssignments.get(link.topic_id);
    if (!assignmentIds) {
      continue;
    }

    assignmentIds.add(question.resource_id);
  }

  const results: AResult[] = effectiveTopics.map((topic) => {
    const assignmentCount = topicAssignments.get(topic.topic_id)?.size ?? 0;
    return {
      topic_id: topic.topic_id,
      module_id: topic.module_id,
      a_score: 0,
      a_raw: assignmentCount,
      assignment_count: assignmentCount,
    };
  });

  const byModule = new Map<string, AResult[]>();
  for (const result of results) {
    const key = result.module_id ?? "__null__";
    const existing = byModule.get(key) ?? [];
    existing.push(result);
    byModule.set(key, existing);
  }

  for (const moduleResults of byModule.values()) {
    const maxCount = moduleResults.reduce((max, result) => Math.max(max, result.assignment_count), 0);

    if (maxCount === 0) {
      for (const result of moduleResults) {
        result.a_score = 0;
      }
      continue;
    }

    for (const result of moduleResults) {
      result.a_score = result.assignment_count / maxCount;
    }
  }

  return results;
}
