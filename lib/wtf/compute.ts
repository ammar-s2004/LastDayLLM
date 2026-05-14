import { getScopeKeyForExamType, isEndSemType, isTTType, type TopicInfo, type ScopedTopicsByExamType } from "@/lib/shared/exam-scope";

export type { TopicInfo, ScopedTopicsByExamType };

export interface PaperQuestion {
  question_id: string;
  marks: number | null;
  resource_id: string;
}

export interface QuestionTopicLink {
  question_id: string;
  topic_id: string;
  relevance: number;
}

export interface PaperMeta {
  resource_id: string;
  detected_exam_type: string | null;
  detected_exam_year: string | null;
  academic_year: number | null;
  created_at: string;
}


export interface WTFResult {
  topic_id: string;
  module_id: string | null;
  wtf_score: number;
  wtf_raw: number;
  question_count: number;
  paper_count: number;
}

export function resolveYear(meta: PaperMeta): number {
  const detectedYear = meta.detected_exam_year ? Number.parseInt(meta.detected_exam_year, 10) : NaN;
  if (Number.isFinite(detectedYear)) {
    return detectedYear;
  }

  if (typeof meta.academic_year === "number" && Number.isFinite(meta.academic_year)) {
    return meta.academic_year;
  }

  return new Date(meta.created_at).getFullYear();
}

export function getPaperTypeWeight(examType: string | null, yearDiff: number): number {
  const normalizedYearDiff = Math.max(0, yearDiff);

  if (isTTType(examType)) {
    if (normalizedYearDiff === 0) return 1.0;
    if (normalizedYearDiff === 1) return 0.7;
    return 0.3;
  }

  if (isEndSemType(examType)) {
    if (normalizedYearDiff === 0) return 1.0;
    if (normalizedYearDiff === 1) return 0.9;
    return 0.5;
  }

  return 0.5;
}

export function computeWTF(
  questions: PaperQuestion[],
  links: QuestionTopicLink[],
  papers: PaperMeta[],
  topics: TopicInfo[],
  scopedTopicsByExamType: ScopedTopicsByExamType,
  currentYear: number,
  allowedTopicIds?: Set<string>
): WTFResult[] {
  const effectiveTopics =
    allowedTopicIds && allowedTopicIds.size > 0
      ? topics.filter((topic) => allowedTopicIds.has(topic.topic_id))
      : topics;

  const topicResults = new Map<
    string,
    {
      topic_id: string;
      module_id: string | null;
      wtf_raw: number;
      questionIds: Set<string>;
      paperIds: Set<string>;
    }
  >();

  for (const topic of effectiveTopics) {
    topicResults.set(topic.topic_id, {
      topic_id: topic.topic_id,
      module_id: topic.module_id,
      wtf_raw: 0,
      questionIds: new Set<string>(),
      paperIds: new Set<string>(),
    });
  }

  const questionsByPaper = new Map<string, PaperQuestion[]>();
  for (const question of questions) {
    const existing = questionsByPaper.get(question.resource_id) ?? [];
    existing.push(question);
    questionsByPaper.set(question.resource_id, existing);
  }

  const linksByQuestion = new Map<string, QuestionTopicLink[]>();
  for (const link of links) {
    const existing = linksByQuestion.get(link.question_id) ?? [];
    existing.push(link);
    linksByQuestion.set(link.question_id, existing);
  }

  for (const paper of papers) {
    const paperQuestions = questionsByPaper.get(paper.resource_id) ?? [];
    if (paperQuestions.length === 0) {
      continue;
    }

    const resolvedYear = resolveYear(paper);
    const yearDiff = currentYear - resolvedYear;
    const ptw = getPaperTypeWeight(paper.detected_exam_type, yearDiff);
    const scopeKey = getScopeKeyForExamType(paper.detected_exam_type);
    const scopedTopics = scopeKey ? scopedTopicsByExamType.get(scopeKey) : undefined;
    const applyScopeGate = isTTType(paper.detected_exam_type) && scopedTopics instanceof Set;

    const resolvedMarks = paperQuestions.map((question) =>
      typeof question.marks === "number" && Number.isFinite(question.marks) ? question.marks : 1
    );
    const paperTotalMarks = resolvedMarks.reduce((sum, marks) => sum + marks, 0);
    const fallbackFraction = paperQuestions.length > 0 ? 1 / paperQuestions.length : 0;

    paperQuestions.forEach((question, index) => {
      const marksFraction =
        paperTotalMarks > 0 ? resolvedMarks[index] / paperTotalMarks : fallbackFraction;

      const questionLinks = linksByQuestion.get(question.question_id) ?? [];
      for (const link of questionLinks) {
        if (applyScopeGate && !scopedTopics?.has(link.topic_id)) {
          continue;
        }

        const topicResult = topicResults.get(link.topic_id);
        if (!topicResult) {
          continue;
        }

        topicResult.wtf_raw += link.relevance * marksFraction * ptw;
        topicResult.questionIds.add(question.question_id);
        topicResult.paperIds.add(paper.resource_id);
      }
    });
  }

  const topicsByModule = new Map<string, WTFResult[]>();
  const initialResults: WTFResult[] = [];

  for (const topic of effectiveTopics) {
    const accumulated = topicResults.get(topic.topic_id);
    const result: WTFResult = {
      topic_id: topic.topic_id,
      module_id: topic.module_id,
      wtf_score: 0,
      wtf_raw: accumulated?.wtf_raw ?? 0,
      question_count: accumulated?.questionIds.size ?? 0,
      paper_count: accumulated?.paperIds.size ?? 0,
    };

    initialResults.push(result);

    const moduleKey = topic.module_id ?? "__null__";
    const existing = topicsByModule.get(moduleKey) ?? [];
    existing.push(result);
    topicsByModule.set(moduleKey, existing);
  }

  for (const moduleResults of topicsByModule.values()) {
    const maxRaw = moduleResults.reduce((max, result) => Math.max(max, result.wtf_raw), 0);

    if (maxRaw === 0) {
      for (const result of moduleResults) {
        result.wtf_score = 0;
      }
      continue;
    }

    for (const result of moduleResults) {
      result.wtf_score = result.wtf_raw / maxRaw;
    }
  }

  return initialResults;
}
