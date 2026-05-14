import type { NotesIntelResult } from "@/lib/extraction/notes-intel";

export interface NCFileResult {
  topic: string;
  subtopic: string;
  nc_file_score: number;
  depth_breakdown: {
    has_derivation: boolean;
    has_worked_example: boolean;
    has_definition: boolean;
    has_diagram: boolean;
    has_code: boolean;
    mention_density: number;
    explanation_depth: number;
    explicitly_highlighted: boolean;
    coverage_confidence: number;
  };
}

export function computeNCFileScores(
  topicCoverage: NotesIntelResult["topic_coverage"]
): NCFileResult[] {
  return topicCoverage.map((item) => {
    // Pedagogical richness: did the teacher invest effort?
    const richness =
      0.25 * item.explanation_depth +
      0.20 * (item.has_derivation ? 1 : 0) +
      0.20 * (item.has_worked_example ? 1 : 0) +
      0.15 * (item.has_diagram ? 1 : 0) +
      0.10 * (item.has_definition ? 1 : 0) +
      0.10 * (item.has_code ? 1 : 0);

    // Emphasis: how prominently did it feature?
    // 0.55 mention_density / 0.45 explicit_highlight
    const emphasis =
      0.55 * item.mention_density +
      0.45 * (item.explicitly_highlighted ? 1 : 0);

    const ncFileScore =
      (0.55 * richness + 0.45 * emphasis) * item.coverage_confidence;

    return {
      topic: item.topic,
      subtopic: item.subtopic,
      nc_file_score: ncFileScore,
      depth_breakdown: {
        has_derivation: item.has_derivation,
        has_worked_example: item.has_worked_example,
        has_definition: item.has_definition,
        has_diagram: item.has_diagram,
        has_code: item.has_code,
        mention_density: item.mention_density,
        explanation_depth: item.explanation_depth,
        explicitly_highlighted: item.explicitly_highlighted,
        coverage_confidence: item.coverage_confidence,
      },
    };
  });
}

export function computeFileWeight(pageCount: number): number {
  return Math.min(1.0, pageCount / 60);
}
