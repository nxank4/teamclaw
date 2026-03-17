/**
 * Vibe coding score module — barrel exports.
 */

export { calculateScore, buildScoreInputFromState } from "./calculator.js";
export { detectPatterns } from "./patterns.js";
export { selectTip } from "./tips.js";
export { VibeScoreStore } from "./store.js";
export { calculateTrend } from "./trends.js";
export type {
  ScoreInput,
  ScoreCalculation,
  DimensionResult,
  DimensionName,
  ScoringEvent,
  BehaviorPattern,
  ScoreTrend,
  TrendDirection,
  VibeScoreEntry,
} from "./types.js";
