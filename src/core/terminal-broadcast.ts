/* eslint-disable @typescript-eslint/no-explicit-any */

import { randomUUID } from "node:crypto";
import { openclawEvents, type OpenClawLogEntry } from "./openclaw-events.js";

const stdoutOriginal = process.stdout.write as (chunk: any, ...args: any[]) => boolean;
const stderrOriginal = process.stderr.write as (chunk: any, ...args: any[]) => boolean;

const BATCH_INTERVAL_MS = 50;
const buffer: { text: string; isStderr: boolean }[] = [];
let broadcastScheduled = false;

// Strip ANSI escape codes
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
}

function flushBuffer(): void {
  if (buffer.length === 0) {
    broadcastScheduled = false;
    return;
  }
  const items = buffer.splice(0);
  broadcastScheduled = false;

  // Group by stderr vs stdout
  const hasError = items.some((i) => i.isStderr);
  const combined = items.map((i) => i.text).join("");
  const cleaned = stripAnsi(combined).trim();
  if (!cleaned) return;

  const entry: OpenClawLogEntry = {
    id: randomUUID(),
    level: hasError ? "warn" : "info",
    source: "console",
    action: hasError ? "stderr" : "stdout",
    model: "",
    botId: "",
    message: cleaned,
    timestamp: Date.now(),
  };
  openclawEvents.emit("log", entry);
}

function scheduleBroadcast(): void {
  if (broadcastScheduled) return;
  broadcastScheduled = true;
  setTimeout(flushBuffer, BATCH_INTERVAL_MS);
}

function broadcastToLog(data: string, isStderr: boolean): void {
  buffer.push({ text: data, isStderr });
  scheduleBroadcast();
}

function makeInterceptor(
  original: (chunk: any, ...args: any[]) => boolean,
  isStderr: boolean,
): (chunk: any, ...args: any[]) => boolean {
  return function (chunk, ...args): boolean {
    const result = original(chunk, ...args);
    const str = typeof chunk === "string" ? chunk : String(chunk);
    if (str) {
      broadcastToLog(str, isStderr);
    }
    return result;
  };
}

export function initTerminalBroadcast(): void {
  process.stdout.write = makeInterceptor(stdoutOriginal, false);
  process.stderr.write = makeInterceptor(stderrOriginal, true);
}

export function restoreTerminal(): void {
  process.stdout.write = stdoutOriginal;
  process.stderr.write = stderrOriginal;
}

export function flushTerminalBuffer(): void {
  if (broadcastScheduled) {
    flushBuffer();
  }
}
