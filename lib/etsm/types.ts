export type SignalKey = "SP" | "NC" | "WTF" | "TE" | "A";
export type PriorityBand = "HIGH" | "MEDIUM" | "LOW";

export interface SubjectContext {
  has_papers: boolean;
  has_assignments: boolean;
  has_hints: boolean;
  hint_confidence_scalar: number;
  college_assignment_factor: number;
}

export interface TopicData {
  topic_id: string;
  module_id: string;
  signals: Record<SignalKey, number>;
}

export interface ScoredTopic extends TopicData {
  base_score: number;
  synergy_bonus: number;
  teacher_floor_applied: number;
  final_score: number;
  band: PriorityBand;
  rank: number;
}
