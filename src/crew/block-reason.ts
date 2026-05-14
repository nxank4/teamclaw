/**
 * BlockReason builders + the single mark-task-blocked entry point.
 *
 * Every phase task block now flows through {@link markTaskBlocked},
 * which sets `status = "blocked"` and `blocked_reason` in one step.
 * The {@link blockReason} builders produce the structured reason
 * value with a user-facing message that points at the fix — what the
 * TUI renders at phase summary and inline in the agent tree.
 *
 * The codes are stable. New reason classes get a new code rather than
 * overloading an existing one — callers that want to discriminate
 * (e.g. "show a 'bump max_tokens' tip on budget_*") rely on the code,
 * not on string-matching the message.
 */

import type { ToolForbidden } from "./capability-gate.js";
import type { TaskErrorKind } from "./types.js";
import type { BlockReason, CrewTask } from "./types.js";
import type { WriteLockTimeoutError } from "./write-lock.js";

export function markTaskBlocked(task: CrewTask, reason: BlockReason): void {
  task.status = "blocked";
  task.blocked_reason = reason;
}

export const blockReason = {
  budgetTask: (used: number, cap: number): BlockReason => ({
    code: "budget_task_exceeded",
    message: `Task exceeded its token budget (${used} used / ${cap} allowed). Increase max_tokens_per_task in the manifest, or split the task.`,
    details: { used, cap, scope: "task" },
  }),

  budgetPhase: (used: number, requested: number, cap: number): BlockReason => ({
    code: "budget_phase_exceeded",
    message: `Phase budget would be exceeded (${used} + ${requested} > ${cap}). Increase max_tokens_per_phase in the manifest, or split work across phases.`,
    details: { used, requested, cap, scope: "phase" },
  }),

  budgetSession: (used: number, cap: number): BlockReason => ({
    code: "budget_session_exceeded",
    message: `Session token cap reached (${used} / ${cap}). Increase max_tokens_per_session in the manifest, or split the goal into shorter runs.`,
    details: { used, cap, scope: "session" },
  }),

  depFailed: (depTaskId: string, upstream?: BlockReason): BlockReason => ({
    code: "dep_failed",
    message: upstream
      ? `Depends on task '${depTaskId}' which did not complete: ${upstream.message}`
      : `Depends on task '${depTaskId}' which did not complete.`,
    details: { dep_task_id: depTaskId, upstream_reason: upstream },
  }),

  capabilityDenied: (denial: ToolForbidden): BlockReason => ({
    code: "capability_denied",
    message:
      denial.reason === "tool_not_in_allowlist"
        ? `Tool '${denial.tool}' is not in this agent's allowlist.`
        : `Write to '${denial.attempted_path ?? "?"}' is outside the agent's write_scope.`,
    details: {
      kind: denial.reason,
      tool_name: denial.tool,
      attempted_path: denial.attempted_path,
      scope: denial.scope,
    },
  }),

  writeLockTimeout: (e: WriteLockTimeoutError): BlockReason => ({
    code: "write_lock_timeout",
    message: `Could not acquire write lock on '${e.key}' (held by '${e.holderAgent}') after ${e.timeoutMs}ms.`,
    details: { path: e.key, holder: e.holderAgent, timeout_ms: e.timeoutMs },
  }),

  validatorFailed: (
    validatorMessage: string,
    ctx: { claimed_writes?: string[]; validator_kind?: string } = {},
  ): BlockReason => ({
    code: "validator_failed",
    message: `Task claimed completion but the validator rejected: ${validatorMessage}`,
    details: ctx,
  }),

  timeout: (seconds: number): BlockReason => ({
    code: "timeout",
    message: `Task exceeded its wall-clock budget of ${seconds}s.`,
    details: { seconds },
  }),

  envError: (
    kind: TaskErrorKind,
    signal?: { exit_code?: number; stderr?: string },
  ): BlockReason => ({
    code: "env_error",
    message: `Environment error: ${kind}${
      signal?.exit_code !== undefined ? ` (exit ${signal.exit_code})` : ""
    }.`,
    details: { kind, signal },
  }),

  agentLogicMaxRetries: (retries: number, lastError: string): BlockReason => ({
    code: "agent_logic_max_retries",
    message: `Recoverable error retried ${retries} times without success: ${lastError}`,
    details: { retries, last_error_message: lastError },
  }),

  userAbort: (where: string): BlockReason => ({
    code: "user_abort",
    message: `Run was aborted by the user during ${where}.`,
    details: { where },
  }),

  abortSignal: (where: string): BlockReason => ({
    code: "abort_signal",
    message: `Run was cancelled by an external signal during ${where}.`,
    details: { where },
  }),

  unknown: (note: string): BlockReason => ({
    code: "unknown",
    message: `Task blocked: ${note}`,
    details: { note },
  }),
} as const;
