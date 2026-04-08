/**
 * Types for debate & stochastic consensus mode.
 */

export interface Perspective {
  id: string;
  name: string;
  description: string;
  response: string;
}

export interface ConsensusPoint {
  type: "agreement" | "disagreement" | "insight";
  summary: string;
  confidence: number;
  perspectives: string[];
}

export interface DebateRecommendation {
  summary: string;
  confidence: number;
  reasoning: string;
}

export interface DebateResult {
  question: string;
  perspectives: Perspective[];
  consensus: ConsensusPoint[];
  recommendation: DebateRecommendation;
}

export type DebateStage =
  | "perspectives"
  | "synthesizing"
  | "done";

export interface DebateEvent {
  stage: DebateStage;
  perspectiveId?: string;
  content?: string;
  result?: DebateResult;
}
