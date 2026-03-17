/**
 * Types for drift detection.
 */

import type { Decision } from "../journal/types.js";

export type ConflictType = "direct" | "indirect" | "ambiguous";
export type DriftSeverity = "none" | "soft" | "hard";
export type DriftResolution = "proceed" | "reconsider" | "adjust_goal" | "abort";

export interface DriftConflict {
  conflictId: string;
  goalFragment: string;
  decision: Decision;
  similarityScore: number;
  conflictType: ConflictType;
  explanation: string;
}

export interface DriftResult {
  hasDrift: boolean;
  severity: DriftSeverity;
  conflicts: DriftConflict[];
  checkedAt: number;
}

export interface DriftHistoryEntry {
  sessionId: string;
  goalText: string;
  conflicts: DriftConflict[];
  resolution: DriftResolution;
  reconsidered: string[];
  detectedAt: number;
}
