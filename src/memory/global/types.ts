/**
 * Type definitions for cross-session global memory.
 */

import type { SuccessPattern } from "../success/types.js";

export type MemoryScope = "session" | "global";

export interface GlobalSuccessPattern extends SuccessPattern {
  promotedAt: number;
  promotedBy: "auto" | "user";
  sourceSessionId: string;
  globalQualityScore: number;
}

export interface GlobalFailureLesson {
  id: string;
  text: string;
  sessionId: string;
  retrievalCount: number;
  helpedAvoidFailure: boolean;
  createdAt: number;
  promotedAt: number;
  promotedBy: "auto" | "user";
}

export type KnowledgeRelationship = "leads_to" | "conflicts_with" | "similar_to" | "depends_on";

export interface KnowledgeEdge {
  id: string;
  fromPatternId: string;
  toPatternId: string;
  relationship: KnowledgeRelationship;
  strength: number;
  observedCount: number;
  createdAt: number;
}

export interface MemoryHealth {
  totalGlobalPatterns: number;
  totalGlobalLessons: number;
  averagePatternAge: number;
  averageQualityScore: number;
  stalePatternsCount: number;
  knowledgeGraphEdges: number;
  oldestPattern: number | null;
  newestPattern: number | null;
}

export interface MemoryExport {
  exportedAt: number;
  version: string;
  globalSuccessPatterns: GlobalSuccessPattern[];
  globalFailureLessons: GlobalFailureLesson[];
  knowledgeGraph: KnowledgeEdge[];
}

export interface GlobalMemoryContext {
  sessionPatterns: SuccessPattern[];
  globalPatterns: GlobalSuccessPattern[];
  sessionLessons: string[];
  globalLessons: GlobalFailureLesson[];
  mergedTopPatterns: SuccessPattern[];
  mergedTopLessons: string[];
}
