/**
 * Transitional shim — the real implementation moved to src/orchestrator.
 * This file is deleted when src/crew/ is removed.
 */
export {
  formatDenialForLLM,
  gateToolCall,
  type GateDecision,
  type GateInput,
  type ToolAllowed,
  type ToolForbidden,
  type ToolForbiddenReason,
} from "../orchestrator/capability-gate.js";
