/**
 * Crew core types — Zod schemas per spec §4.2.
 *
 * `CrewGraphState` keeps its existing simple TS interface for the runner
 * surface (mode, goal, crew_name) while the spec's full state schema is
 * built up incrementally. The Zod-first types here are the canonical
 * shapes used by the plan parser, artifact store payloads, and the
 * phase executor (next PR).
 */

import { z } from "zod";

// ── Task ───────────────────────────────────────────────────────────────

export const TaskStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "incomplete",
  "failed",
  "blocked",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskErrorKindSchema = z.enum([
  "env_command_not_found",
  "env_missing_dep",
  "env_perm",
  "env_port_in_use",
  "timeout",
  "agent_logic",
  "unknown",
]);
export type TaskErrorKind = z.infer<typeof TaskErrorKindSchema>;

// Why-the-task-is-blocked classifier. Distinct from TaskErrorKind:
// TaskErrorKind says *how the agent failed* (env vs. agent logic vs.
// timeout) and is the input the retry policy consumes. BlockReasonCode
// says *which gate stopped this task* once retries are exhausted — what
// the user needs to read on the screen to take action. The two overlap
// for env_error / timeout / agent_logic_max_retries (where the
// classification carries through into details.kind) but diverge for
// budget, capability, lock, dep, validator, and abort sources.
export const BlockReasonCodeSchema = z.enum([
  "budget_task_exceeded",
  "budget_phase_exceeded",
  "budget_session_exceeded",
  "dep_failed",
  "capability_denied",
  "write_lock_timeout",
  "validator_failed",
  "timeout",
  "env_error",
  "agent_logic_max_retries",
  "user_abort",
  "abort_signal",
  "unknown",
]);
export type BlockReasonCode = z.infer<typeof BlockReasonCodeSchema>;

export const BlockReasonSchema = z.object({
  code: BlockReasonCodeSchema,
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type BlockReason = z.infer<typeof BlockReasonSchema>;

export const CrewTaskSchema = z.object({
  id: z.string().min(1),
  phase_id: z.string().min(1),
  description: z.string().min(1),
  assigned_agent: z.string().min(1),
  depends_on: z.array(z.string()).default([]),
  status: TaskStatusSchema.default("pending"),
  tool_calls: z.array(z.unknown()).default([]),
  tool_call_results: z.array(z.unknown()).default([]),
  last_shell_failure: z.unknown().optional(),
  result: z.string().optional(),
  files_created: z.array(z.string()).default([]),
  files_modified: z.array(z.string()).default([]),
  blocked_reason: BlockReasonSchema.optional(),
  input_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
  max_tokens_per_task: z.number().int().positive().default(50_000),
  wall_time_ms: z.number().default(0),
  llm_calls: z.number().default(0),
  retry_count: z.number().default(0),
  confidence: z.number().min(0).max(100).optional(),
});
export type CrewTask = z.infer<typeof CrewTaskSchema>;

// ── Phase ──────────────────────────────────────────────────────────────

export const PhaseStatusSchema = z.enum([
  "pending",
  "planning",
  "executing",
  "reviewing",
  "awaiting_user",
  "completed",
  "aborted",
]);
export type PhaseStatus = z.infer<typeof PhaseStatusSchema>;

export const ComplexityTierSchema = z.enum(["1", "2", "3"]);
export type ComplexityTier = z.infer<typeof ComplexityTierSchema>;

export const CrewPhaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  status: PhaseStatusSchema.default("pending"),
  complexity_tier: ComplexityTierSchema.default("2"),
  tasks: z.array(CrewTaskSchema),
  artifact_ids: z.array(z.string()).default([]),
  max_tokens_per_phase: z.number().int().positive().default(200_000),
  tokens_used: z.number().int().nonnegative().default(0),
  started_at: z.number().optional(),
  completed_at: z.number().optional(),
});
export type CrewPhase = z.infer<typeof CrewPhaseSchema>;

// ── Runner surface (preserved interface — not a Zod schema) ────────────

export interface CrewGraphState {
  goal: string;
  crew_name: string;
}

export interface CrewRunOptions {
  goal: string;
  crew_name: string;
  workdir: string;
}

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}
