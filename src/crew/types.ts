/**
 * Sprint mode types — lightweight autonomous task orchestration.
 */

export interface CrewToolCallResult {
  /** Tool name. */
  name: string;
  /** Shell exit code for shell_exec (and tools that wrap it). */
  exitCode?: number;
  /** First ~200 chars of stderr for shell_exec. */
  stderrHead?: string;
}

export interface CrewTask {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "incomplete";
  assignedAgent?: string;
  result?: string;
  error?: string;
  /** Tool names called during this task's execution (deduped). */
  toolsCalled?: string[];
  /** Per-call tool results with structured metadata (exit code, stderr head). Not deduped. */
  toolCallResults?: CrewToolCallResult[];
  /** 1-based task indices that must complete before this task can start. */
  dependsOn?: number[];
}

export type CrewPhase = "planning" | "executing" | "paused" | "done" | "stopped";

export interface CrewState {
  goal: string;
  tasks: CrewTask[];
  currentTaskIndex: number;
  phase: CrewPhase;
  startedAt: string;
  completedTasks: number;
  failedTasks: number;
  inputTokens: number;
  outputTokens: number;
}

export interface CrewResult {
  goal: string;
  tasks: CrewTask[];
  completedTasks: number;
  failedTasks: number;
  duration: number;
  inputTokens: number;
  outputTokens: number;
}

export interface CrewTeamContext {
  templateId: string;
  templateName: string;
  pipeline: string[];
  agents: Array<{ role: string; task?: string }>;
  mode: "template" | "manual";
}

export interface CrewOptions {
  /** Max tasks the planner should generate. Default: 10. */
  maxTasks?: number;
  /** Max concurrent tasks when running in parallel. Default: 3. */
  maxConcurrency?: number;
  /** Team template context — when set, planner and agent assignment use template roles. */
  teamContext?: CrewTeamContext;
  /** Lessons from previous runs — injected into the planner prompt. */
  lessons?: string[];
}

export interface CrewEventMap {
  "crew:start": { goal: string };
  "crew:composition": { entries: Array<{ role: string; task: string; included: boolean; reason: string }>; estimatedTasks: number };
  "crew:plan": { tasks: CrewTask[] };
  "crew:round:start": { round: number; tasks: CrewTask[] };
  "crew:round:complete": { round: number; duration: number };
  "crew:task:start": { task: CrewTask; agentName: string };
  "crew:task:complete": { task: CrewTask; taskIndex?: number; totalTasks?: number };
  "crew:agent:token": { agentName: string; token: string };
  "crew:agent:tool": {
    agentName: string;
    toolName: string;
    status: string;
    details?: {
      executionId?: string;
      inputSummary?: string;
      duration?: number;
      outputSummary?: string;
      success?: boolean;
    };
  };
  "crew:done": { result: CrewResult };
  "crew:needs_clarification": { questions: string[] };
  "crew:error": { error: Error; task?: CrewTask };
  "crew:warning": { warning: string; type: string; taskIndex?: number };
  "crew:planning": undefined;
  "crew:paused": undefined;
  "crew:resumed": undefined;
}
