/**
 * Drift detection — barrel export.
 */

export type {
  DriftResult,
  DriftConflict,
  DriftSeverity,
  DriftResolution,
  DriftHistoryEntry,
  ConflictType,
} from "./types.js";
export { detectDrift } from "./detector.js";
export type { DetectorOptions } from "./detector.js";
export { extractGoalFragment } from "./fragment-extractor.js";
export { generateExplanation } from "./explainer.js";
export { DriftHistoryStore } from "./history.js";
