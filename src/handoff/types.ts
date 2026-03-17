import type { Decision } from "../journal/types.js";

export interface HandoffConfig {
  autoGenerate: boolean;
  outputPath: string;
  keepHistory: boolean;
  gitCommit: boolean;
}

export const DEFAULT_HANDOFF_CONFIG: HandoffConfig = {
  autoGenerate: true,
  outputPath: "./CONTEXT.md",
  keepHistory: true,
  gitCommit: false,
};

export interface LeftToDoItem {
  description: string;
  type: "deferred" | "escalated" | "approved_rfc" | "open_task";
  priority: "high" | "medium" | "low";
  command?: string;
}

export interface TeamPerformanceEntry {
  agentRole: string;
  trend: string;
  avgConfidence: number;
  note: string;
}

export interface HandoffData {
  generatedAt: number;
  sessionId: string;
  projectPath: string;
  completedGoal: string;
  sessionStatus: "complete" | "partial" | "failed";
  currentState: string[];
  activeDecisions: Decision[];
  leftToDo: LeftToDoItem[];
  teamLearnings: string[];
  teamPerformance: TeamPerformanceEntry[];
  resumeCommands: string[];
}
