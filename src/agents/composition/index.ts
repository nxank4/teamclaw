/**
 * Autonomous team composition — barrel exports.
 */

export type {
  TeamMode,
  AgentRole,
  ActiveAgent,
  ExcludedAgent,
  TeamComposition,
  CompositionOverride,
  CompositionHistoryEntry,
} from "./types.js";
export {
  REQUIRED_AGENTS,
  BYPASSABLE_GRAPH_AGENTS,
  POST_GRAPH_AGENTS,
} from "./types.js";
export type { AgentInclusionRule, InclusionScore, InclusionResult } from "./rules.js";
export {
  AGENT_INCLUSION_RULES,
  scoreAgentInclusion,
  shouldIncludeAgent,
} from "./rules.js";
export { analyzeGoal } from "./analyzer.js";
export type { AnalyzeGoalOptions } from "./analyzer.js";
export { withCompositionGate } from "./wiring.js";
export { CompositionHistoryStore } from "./history.js";
