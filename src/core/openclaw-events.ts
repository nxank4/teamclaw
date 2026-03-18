/**
 * Backward-compat shim — re-exports from llm-events.ts with old names.
 * Will be deleted in Phase 12.
 */
export {
  llmEvents as openclawEvents,
  type LlmLogLevel as OpenClawLogLevel,
  type LlmLogEntry as OpenClawLogEntry,
  type LlmStreamChunk as OpenClawStreamChunk,
} from "./llm-events.js";
