/**
 * Conversation flow pattern types.
 */

export interface ClarificationNeeded {
  reason: string;
  questions: string[];
  severity: "ask" | "suggest";
}

export interface ConfirmationRequest {
  message: string;
  details: string[];
  estimatedCost: string;
  risk: "low" | "moderate" | "high";
}

export interface PlanPreviewData {
  summary: string;
  steps: PlanStep[];
  estimatedCost: number;
  estimatedDuration: string;
  agents: string[];
  toolsUsed: string[];
}

export interface PlanStep {
  index: number;
  agent: string;
  task: string;
  tools: string[];
  dependsOn: number[];
  parallel: boolean;
}

export interface UndoTarget {
  filePath: string;
  operation: "created" | "modified" | "deleted";
  agentId: string;
  timestamp: string;
  snapshotPath: string | null;
}

export interface UndoResult {
  filePath: string;
  action: "restored" | "deleted";
}

export type FlowDecision =
  | { type: "proceed" }
  | { type: "clarify"; questions: string[] }
  | { type: "confirm"; request: ConfirmationRequest }
  | { type: "preview"; data: PlanPreviewData }
  | { type: "cancel"; reason: string };
