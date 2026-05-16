/**
 * Transitional shim — the real implementation moved to src/orchestrator.
 * This file is deleted when src/crew/ is removed.
 */
export {
  MAX_SUBAGENT_DEPTH,
  DEFAULT_TOKEN_BUDGET,
  runSubagent,
  SubagentDepthExceeded,
  SubagentBudgetExceeded,
  type TokenBudget,
  type SubagentError,
  type SubagentResult,
  type SubagentDebugInfo,
  type SubagentProgressEvent,
  type SubagentProgressEmitter,
  type SubagentTokenEmitter,
  type RunSubagentArgs,
  type ArtifactStoreReader,
  type ArtifactId,
} from "../orchestrator/subagent-runner.js";
