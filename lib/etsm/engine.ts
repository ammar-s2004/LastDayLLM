import type {
  PriorityBand,
  ScoredTopic,
  SignalKey,
  SubjectContext,
  TopicData,
} from "./types";

export class ETSMFusionEngine {
  buildActiveWeights(ctx: SubjectContext): Partial<Record<SignalKey, number>> {
    const rawWeights: Partial<Record<SignalKey, number>> = {
      SP: 0.18,
      NC: 0.1,
    };

    if (ctx.has_papers) {
      rawWeights.WTF = 0.28;
    }

    if (ctx.has_hints) {
      rawWeights.TE = 0.32 * ctx.hint_confidence_scalar;
    }

    if (ctx.has_assignments && ctx.college_assignment_factor > 0) {
      rawWeights.A = 0.12 * ctx.college_assignment_factor;
    }

    const total = Object.values(rawWeights).reduce((sum, value) => sum + (value ?? 0), 0);

    if (total === 0) {
      return { SP: 0.64, NC: 0.36 };
    }

    const normalizedWeights: Partial<Record<SignalKey, number>> = {};

    for (const key of Object.keys(rawWeights) as SignalKey[]) {
      const value = rawWeights[key];

      if (value !== undefined) {
        normalizedWeights[key] = value / total;
      }
    }

    return normalizedWeights;
  }

  scoreTopic(
    topic: TopicData,
    weights: Partial<Record<SignalKey, number>>,
    ctx: SubjectContext
  ): ScoredTopic {
    let baseScore = 0;
    const TE_STRONG_THRESHOLD = 0.7;
    const effectiveWeights: Partial<Record<SignalKey, number>> = { ...weights };

    if (ctx.has_hints && topic.signals.TE < TE_STRONG_THRESHOLD) {
      delete effectiveWeights.TE;

      const total = Object.values(effectiveWeights).reduce((sum, value) => sum + (value ?? 0), 0);

      if (total > 0) {
        for (const key of Object.keys(effectiveWeights) as SignalKey[]) {
          const value = effectiveWeights[key];

          if (value !== undefined) {
            effectiveWeights[key] = value / total;
          }
        }
      }
    }

    for (const key of Object.keys(effectiveWeights) as SignalKey[]) {
      const weight = effectiveWeights[key];

      if (weight !== undefined) {
        baseScore += weight * topic.signals[key];
      }
    }

    let strongCount = 0;

    for (const key of Object.keys(effectiveWeights) as SignalKey[]) {
      if ((effectiveWeights[key] ?? 0) > 0 && topic.signals[key] >= 0.6) {
        strongCount += 1;
      }
    }

    const synergyBonus = 0.04 * Math.max(0, strongCount - 1);
    const rawScore = baseScore + synergyBonus;
    const teacherFloor =
      ctx.has_hints && topic.signals.TE >= 0.75 && ctx.hint_confidence_scalar >= 0.6 ? 0.65 : 0;
    const finalScore = Math.min(1.0, Math.max(rawScore, teacherFloor));

    return {
      ...topic,
      base_score: baseScore,
      synergy_bonus: synergyBonus,
      teacher_floor_applied: teacherFloor,
      final_score: finalScore,
      band: "LOW",
      rank: 0,
    };
  }

  rankModule(topics: TopicData[], ctx: SubjectContext): ScoredTopic[] {
    const weights = this.buildActiveWeights(ctx);
    const scored = topics
      .map((topic) => this.scoreTopic(topic, weights, ctx))
      .sort((a, b) => b.final_score - a.final_score);

    const rankable: ScoredTopic[] = [];
    const garbage: ScoredTopic[] = [];

    for (const topic of scored) {
      if (topic.final_score < 0.25) {
        garbage.push(topic);
      } else {
        rankable.push(topic);
      }
    }

    const highCount = Math.ceil(rankable.length * 0.3);
    const mediumCount = Math.round(rankable.length * 0.4);

    for (let index = 0; index < rankable.length; index += 1) {
      const band: PriorityBand =
        index < highCount
          ? "HIGH"
          : index < highCount + mediumCount
            ? "MEDIUM"
            : "LOW";

      rankable[index] = {
        ...rankable[index],
        band,
        rank: index + 1,
      };
    }

    for (let index = 0; index < garbage.length; index += 1) {
      garbage[index] = {
        ...garbage[index],
        band: "LOW",
        rank: rankable.length + index + 1,
      };
    }

    return [...rankable, ...garbage];
  }
}
