/**
 * Types for vibe coding score — a rolling observational metric (0-100)
 * reflecting how the user collaborates with their AI team.
 */

/** Pre-collected raw counts fed to the calculator. */
export interface ScoreInput {
  // Team Trust inputs
  autoApprovedCount: number;
  manualApprovedCount: number;
  rejectedCount: number;
  escalatedCount: number;
  hardDriftProceedCount: number;
  previousAutoRatio: number | null;

  // Review Engagement inputs
  skippedQaReviewCount: number;
  rejectedNoFeedbackCount: number;
  rejectedWithFeedbackCount: number;
  forceApprovedAfterReworkCount: number;

  // Warning Response inputs
  ignoredHardDriftCount: number;
  ignoredSoftDriftCount: number;
  driftReconsideredCount: number;
  clarityBlockingProceededCount: number;
  clarityIssuesAnsweredCount: number;
  ignoredBlockPushbackCount: number;

  // Confidence Alignment inputs
  averageConfidence: number;
  previousAverageConfidence: number | null;
  lowConfidenceApprovedCount: number;
  escalatedForceProceedCount: number;

  // Optional per-agent breakdown for patterns
  overridesByAgent?: Record<string, number>;
}

export interface ScoringEvent {
  dimension: DimensionName;
  type: "bonus" | "penalty";
  label: string;
  points: number;
}

export type DimensionName =
  | "team_trust"
  | "review_engagement"
  | "warning_response"
  | "confidence_alignment";

export interface DimensionResult {
  score: number;
  base: number;
  bonuses: number;
  penalties: number;
  detail: string;
  events: ScoringEvent[];
}

export interface ScoreCalculation {
  overall: number;
  dimensions: Record<DimensionName, DimensionResult>;
  events: ScoringEvent[];
  computedAt: number;
}

export type TrendDirection = "improving" | "degrading" | "stable" | "plateaued";

export interface ScoreTrend {
  current: number;
  lastWeek: number | null;
  delta: number | null;
  direction: TrendDirection;
  history: { date: string; overall: number }[];
}

export interface BehaviorPattern {
  id: string;
  label: string;
  sentiment: "positive" | "negative" | "neutral";
}

export interface VibeScoreEntry {
  id: string;
  date: string;
  overall: number;
  teamTrust: number;
  reviewEngagement: number;
  warningResponse: number;
  confidenceAlignment: number;
  sessionCount: number;
  eventsJson: string;
  patternsJson: string;
  tip: string;
  computedAt: number;
}
