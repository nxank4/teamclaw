/**
 * Pure-data source of truth for live crew run progress.
 *
 * Owned by the host (TUI router-wiring, headless print loop). Mutators
 * are void-returning so callers can batch a render after several
 * updates. No TUI imports — this module is safe to use from both the
 * interactive layout and the non-interactive stdout path.
 */

export type AgentRunStatus = "queued" | "running" | "done" | "blocked" | "skipped";

export interface AgentRunEntry {
  agentId: string;
  status: AgentRunStatus;
  metric: string;
  inputTokens: number;
  outputTokens: number;
}

export interface CrewRunState {
  agents: Map<string, AgentRunEntry>;
  totalInputTokens: number;
  totalOutputTokens: number;
  goalText: string;
  isComplete: boolean;
}

export function createCrewRunState(goal: string): CrewRunState {
  return {
    agents: new Map(),
    totalInputTokens: 0,
    totalOutputTokens: 0,
    goalText: goal,
    isComplete: false,
  };
}

function getOrCreate(state: CrewRunState, agentId: string): AgentRunEntry {
  const existing = state.agents.get(agentId);
  if (existing) return existing;
  const entry: AgentRunEntry = {
    agentId,
    status: "queued",
    metric: "queued",
    inputTokens: 0,
    outputTokens: 0,
  };
  state.agents.set(agentId, entry);
  return entry;
}

export function markAgentQueued(
  state: CrewRunState,
  agentId: string,
  metric: string = "queued",
): void {
  const entry = getOrCreate(state, agentId);
  // Only downgrade to queued from an unknown / queued state. Don't
  // un-do a running/done agent if the planner re-queues mid-run.
  if (entry.status === "queued") {
    entry.metric = metric;
  }
}

export function markAgentRunning(state: CrewRunState, agentId: string): void {
  const entry = getOrCreate(state, agentId);
  entry.status = "running";
  entry.metric = "running";
}

export function markAgentDone(state: CrewRunState, agentId: string, metric: string): void {
  const entry = getOrCreate(state, agentId);
  entry.status = "done";
  entry.metric = metric;
}

export function markAgentBlocked(state: CrewRunState, agentId: string, reason: string): void {
  const entry = getOrCreate(state, agentId);
  entry.status = "blocked";
  entry.metric = reason;
}

export function addTokens(
  state: CrewRunState,
  agentId: string,
  input: number,
  output: number,
): void {
  const entry = getOrCreate(state, agentId);
  entry.inputTokens += input;
  entry.outputTokens += output;
  state.totalInputTokens += input;
  state.totalOutputTokens += output;
}

export function markComplete(state: CrewRunState): void {
  state.isComplete = true;
}
