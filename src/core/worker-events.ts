import { EventEmitter } from "node:events";

export interface WorkerProgressStep {
  taskQueue: Record<string, unknown>[];
}

export interface WorkerReasoningStep {
  taskId: string;
  botId: string;
  reasoning: string;
}

export interface WorkerStreamChunk {
  botId: string;
  chunk: string;
}

export const workerEvents = new EventEmitter();
