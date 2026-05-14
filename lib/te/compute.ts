export interface TopicModuleInfo {
  topic_id: string;
  module_id: string | null;
}

export interface TEEmphasisInput {
  topic_id: string;
  emphasis_score: number;
  reason: string;
}

export interface TEResult {
  topic_id: string;
  module_id: string | null;
  te_score: number;
  te_raw: number;
  reason: string;
}

export function getConfidenceScalar(confidence: string): number {
  const normalized = confidence.trim().toUpperCase();

  if (normalized === "EXACT") return 1.0;
  if (normalized === "VAGUE") return 0.6;
  if (normalized === "INFERRED") return 0.3;
  if (normalized === "GUESS") return 0.3;

  return 1.0;
}

export function computeTE(
  emphasisScores: TEEmphasisInput[],
  confidence: string,
  topics: TopicModuleInfo[],
  allowedTopicIds?: Set<string>
): TEResult[] {
  const scalar = getConfidenceScalar(confidence);
  const effectiveTopics =
    allowedTopicIds && allowedTopicIds.size > 0
      ? topics.filter((topic) => allowedTopicIds.has(topic.topic_id))
      : topics;
  const emphasisByTopic = new Map(
    emphasisScores.map((item) => [
      item.topic_id,
      {
        emphasis_score: Math.min(1, Math.max(0, item.emphasis_score)),
        reason: item.reason,
      },
    ])
  );

  const results: TEResult[] = effectiveTopics.map((topic) => {
    const emphasis = emphasisByTopic.get(topic.topic_id);
    const teRaw = (emphasis?.emphasis_score ?? 0) * scalar;

    return {
      topic_id: topic.topic_id,
      module_id: topic.module_id,
      te_score: 0,
      te_raw: teRaw,
      reason: emphasis?.reason ?? "",
    };
  });

  for (const result of results) {
    result.te_score = result.te_raw;
  }

  return results;
}
