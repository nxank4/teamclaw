/**
 * LLM structured log events — emitted from llm-client and worker-adapter
 * so the dashboard can display LLM request activity in real time.
 */

import { EventEmitter } from "node:events";

export type LlmLogLevel = "info" | "success" | "warn" | "error";

export interface LlmLogEntry {
  id: string;
  level: LlmLogLevel;
  source: "llm-client" | "worker-adapter" | "gateway" | "console";
  action: string;
  model: string;
  botId: string;
  message: string;
  meta?: Record<string, unknown>;
  timestamp: number;
}

export interface LlmStreamChunk {
  botId: string;
  model: string;
  chunk: string;
  timestamp: number;
}

export const llmEvents = new EventEmitter();
