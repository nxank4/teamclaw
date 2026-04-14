/**
 * Type definitions for success pattern storage & retrieval.
 */

export interface SuccessPattern {
  id: string;
  sessionId: string;
  taskDescription: string;
  agentRole: string;
  approach: string;
  resultSummary: string;
  confidence: number;
  approvalType: "auto" | "user";
  reworkCount: number;
  goalContext: string;
  tags: string[];
  embedding?: number[];
  createdAt: number;
  runIndex: number;
}

export interface PatternQuality {
  patternId: string;
  timesRetrieved: number;
  timesResultedInHighConfidence: number;
  qualityScore: number;
}

export interface LearningCurve {
  sessionId: string;
  runs: LearningCurveEntry[];
}

export interface LearningCurveEntry {
  runIndex: number;
  averageConfidence: number;
  autoApprovedCount: number;
  patternsUsed: number;
  newPatternsStored: number;
}

export interface MemoryContext {
  failureLessons: string[];
  successPatterns: SuccessPattern[];
  relevanceScores: Array<{ id: string; score: number }>;
}
