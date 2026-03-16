/**
 * Types for autonomous team composition.
 */

export type TeamMode = "manual" | "autonomous";

export type AgentRole =
  | "sprint_planning"
  | "system_design"
  | "rfc_phase"
  | "coordinator"
  | "memory_retrieval"
  | "worker_task"
  | "approval"
  | "post_mortem"
  | "retrospective";

export interface ActiveAgent {
  role: AgentRole;
  reason: string;
  confidence: number;
}

export interface ExcludedAgent {
  role: AgentRole;
  reason: string;
}

export interface TeamComposition {
  mode: TeamMode;
  activeAgents: ActiveAgent[];
  excludedAgents: ExcludedAgent[];
  overallConfidence: number;
  analyzedGoal: string;
  analyzedAt: string;
}

export interface CompositionOverride {
  role: AgentRole;
  action: "include" | "exclude";
}

export interface CompositionHistoryEntry {
  id: string;
  composition: TeamComposition;
  overrides: CompositionOverride[];
  goal: string;
  runId: number;
  success: boolean;
  createdAt: string;
}

/** Agents that are always active regardless of composition analysis. */
export const REQUIRED_AGENTS: AgentRole[] = [
  "coordinator",
  "memory_retrieval",
  "worker_task",
  "approval",
];

/** Graph nodes that can be bypassed via composition gate. */
export const BYPASSABLE_GRAPH_AGENTS: AgentRole[] = [
  "sprint_planning",
  "system_design",
  "rfc_phase",
];

/** Agents that run outside the graph in work-runner. */
export const POST_GRAPH_AGENTS: AgentRole[] = [
  "post_mortem",
  "retrospective",
];
