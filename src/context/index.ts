/**
 * Context management — tracking, compaction, doom-loop detection,
 * and tool output summarization.
 */

export { ContextTracker, estimateTokens, estimateMessageTokens } from "./context-tracker.js";
export { compact } from "./compaction.js";
export { DoomLoopDetector } from "./doom-loop-detector.js";
export { ToolOutputHandler } from "./tool-output-handler.js";

export type {
  ContextLevel,
  ContextSnapshot,
  CompactionResult,
  ToolCallFingerprint,
  DoomLoopVerdict,
  ToolOutputConfig,
  SummarizedOutput,
} from "./types.js";

export type { CompactableMessage, CompactionOptions } from "./compaction.js";
