/**
 * Per-branch sandbox runtime lifecycle management.
 * Each parallel agent branch gets its own isolated code executor.
 * Runtimes are created on branch start and disposed on completion.
 */

import { createCodeExecutorTool } from "./code-executor.js";

export type CodeExecutor = ReturnType<typeof createCodeExecutorTool>;

/** Roles that are allowed to execute code in the sandbox. */
const SANDBOX_ELIGIBLE_ROLES = new Set([
  "software_engineer",
  "backend_engineer",
  "frontend_engineer",
  "devops_engineer",
  "qa_reviewer",
]);

/** Active runtimes keyed by agent branch ID (taskId + botId). */
const agentRuntimes = new Map<string, CodeExecutor>();

function branchKey(taskId: string, botId: string): string {
  return `${taskId}:${botId}`;
}

/** Check if a role is eligible for sandboxed code execution. */
export function isSandboxEligible(roleId: string): boolean {
  return SANDBOX_ELIGIBLE_ROLES.has(roleId);
}

/** Create and register a sandbox runtime for an agent branch. */
export function initAgentBranch(
  taskId: string,
  botId: string,
  workspacePath: string,
): CodeExecutor {
  const key = branchKey(taskId, botId);
  // Dispose existing runtime if somehow still present
  cleanupAgentBranch(taskId, botId);
  const executor = createCodeExecutorTool(workspacePath);
  agentRuntimes.set(key, executor);
  return executor;
}

/** Dispose and remove the sandbox runtime for an agent branch. */
export function cleanupAgentBranch(taskId: string, botId: string): void {
  const key = branchKey(taskId, botId);
  const executor = agentRuntimes.get(key);
  if (executor) {
    executor.dispose();
    agentRuntimes.delete(key);
  }
}

/** Get the sandbox runtime for an agent branch (if active). */
export function getAgentBranchExecutor(
  taskId: string,
  botId: string,
): CodeExecutor | undefined {
  return agentRuntimes.get(branchKey(taskId, botId));
}

/** Dispose all active runtimes (for graph teardown). */
export function disposeAllRuntimes(): void {
  for (const executor of agentRuntimes.values()) {
    executor.dispose();
  }
  agentRuntimes.clear();
}
