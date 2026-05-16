/**
 * Transitional shim — the real implementation moved to src/orchestrator.
 * This file is deleted when src/crew/ is removed.
 */
export {
  DEFAULT_LOCK_TIMEOUT_MS,
  WriteLockManager,
  WriteLockReleaseError,
  WriteLockTimeoutError,
  type WriteLockDenied,
  type WriteLockGranted,
  type WriteLockResult,
} from "../orchestrator/write-lock.js";
