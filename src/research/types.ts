/**
 * Types for the auto research/optimization loop.
 */

export interface MetricConfig {
  /** Shell command to run to measure the metric. */
  command: string;
  /** JSONPath or regex to extract the numeric value from command output. */
  extract: string;
  /** Whether to maximize or minimize the metric. */
  direction: "maximize" | "minimize";
  /** Optional baseline value (auto-measured if null). */
  baseline: number | null;
}

export interface ChangeConfig {
  /** File/directory globs the agent is allowed to modify. */
  scope: string[];
  /** Strategy for changes: iterative (one at a time) or batch. */
  strategy: "iterative" | "batch";
}

export interface AssessConfig {
  /** Test command (must pass for a change to be kept). */
  tests?: string;
  /** Lint command (optional, must pass if set). */
  lint?: string;
  /** Typecheck command (optional, must pass if set). */
  typecheck?: string;
}

export interface ResearchConstraints {
  /** Maximum number of iterations. */
  maxIterations: number;
  /** Max consecutive regressions before stopping. */
  maxRegressionsBeforeStop: number;
  /** Whether tests must pass for a change to be kept. */
  requireTestPass: boolean;
  /** Total timeout in milliseconds. */
  timeoutMs: number;
}

export interface ResearchConfig {
  name: string;
  metric: MetricConfig;
  change: ChangeConfig;
  assess: AssessConfig;
  constraints: ResearchConstraints;
}

export interface Iteration {
  index: number;
  description: string;
  scoreBefore: number;
  scoreAfter: number;
  delta: number;
  kept: boolean;
  reason?: string;
  durationMs: number;
}

export type ResearchStatus = "running" | "paused" | "stopped" | "completed";

export interface ResearchState {
  config: ResearchConfig;
  status: ResearchStatus;
  branch: string;
  baseline: number;
  bestScore: number;
  currentIteration: number;
  iterations: Iteration[];
  consecutiveRegressions: number;
  startedAt: number;
  /** Event emitter for progress updates. */
}

export interface ResearchResult {
  config: ResearchConfig;
  baseline: number;
  finalScore: number;
  totalIterations: number;
  keptChanges: number;
  revertedChanges: number;
  durationMs: number;
  iterations: Iteration[];
}

export type ResearchEvent =
  | { type: "started"; config: ResearchConfig; baseline: number }
  | { type: "iteration_start"; index: number }
  | { type: "iteration_end"; iteration: Iteration }
  | { type: "paused" }
  | { type: "resumed" }
  | { type: "stopped"; result: ResearchResult }
  | { type: "completed"; result: ResearchResult }
  | { type: "error"; message: string };
