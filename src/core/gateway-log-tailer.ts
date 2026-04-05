/**
 * Tails the gateway log file (~/.openpawl/gateway.log)
 * and emits parsed entries into llmEvents so they appear in the dashboard.
 */

import { open, stat } from "node:fs/promises";
import { existsSync, watch as fsWatch } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { llmEvents, type LlmLogLevel } from "./llm-events.js";

const GATEWAY_LOG = path.join(os.homedir(), ".openpawl", "gateway.log");
const POLL_INTERVAL_MS = 5_000;
const DEBOUNCE_MS = 50;

function parseLevel(raw: string): LlmLogLevel {
  if (raw === "error") return "error";
  if (raw === "warn") return "warn";
  if (raw === "success") return "success";
  return "info";
}

interface ParsedGatewayLine {
  level: LlmLogLevel;
  action: string;
  message: string;
  meta: Record<string, unknown>;
}

function parseGatewayLine(line: string): ParsedGatewayLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Format: HH:MM:SS <level> <subsystem> [inline-json] <text> key=value...
  const match = trimmed.match(/^\d{2}:\d{2}:\d{2}\s+(info|warn|error|debug|success)\s+(.+)$/);
  if (!match) return { level: "info", action: "gateway", message: trimmed, meta: {} };

  const level = parseLevel(match[1]);
  let rest = match[2];
  const meta: Record<string, unknown> = {};

  // Extract subsystem (first token like gateway/ws, gateway/route)
  let action = "gateway";
  const subsysMatch = rest.match(/^(\S+)\s+/);
  if (subsysMatch) {
    action = subsysMatch[1];
    rest = rest.slice(subsysMatch[0].length);
  }

  // Extract inline JSON blocks
  rest = rest.replace(/\{[^}]*\}/g, (jsonStr) => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed === "object" && parsed !== null) {
        Object.assign(meta, parsed);
      }
    } catch { /* ignore malformed JSON */ }
    return "";
  });

  // Extract key=value pairs
  rest = rest.replace(/\b(\w+)=(\S+)/g, (_match, key: string, value: string) => {
    meta[key] = value;
    return "";
  });

  // Remaining text is the clean message
  const message = rest.replace(/\s+/g, " ").trim();

  return { level, action, message: message || action, meta };
}

export function startGatewayLogTailer(): () => void {
  let stopped = false;
  let offset = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let watcher: ReturnType<typeof fsWatch> | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  async function readNewLines(): Promise<void> {
    if (stopped) return;
    try {
      const fileStat = await stat(GATEWAY_LOG);
      // Handle log rotation: file got smaller
      if (fileStat.size < offset) {
        offset = 0;
      }
      if (fileStat.size === offset) return;

      const fh = await open(GATEWAY_LOG, "r");
      try {
        const buf = Buffer.alloc(fileStat.size - offset);
        await fh.read(buf, 0, buf.length, offset);
        offset = fileStat.size;

        const text = buf.toString("utf-8");
        for (const line of text.split("\n")) {
          const parsed = parseGatewayLine(line);
          if (!parsed) continue;
          llmEvents.emit("log", {
            id: randomUUID(),
            level: parsed.level,
            source: "gateway",
            action: parsed.action,
            model: "",
            botId: "",
            message: parsed.message,
            meta: Object.keys(parsed.meta).length > 0 ? parsed.meta : undefined,
            timestamp: Date.now(),
          });
        }
      } finally {
        await fh.close();
      }
    } catch {
      // File may have been removed or is inaccessible — ignore
    }
  }

  function debouncedRead(): void {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      readNewLines();
    }, DEBOUNCE_MS);
  }

  async function startWatching(): Promise<void> {
    // Seek to end of file so we only emit new lines
    try {
      const fileStat = await stat(GATEWAY_LOG);
      offset = fileStat.size;
    } catch {
      offset = 0;
    }

    watcher = fsWatch(GATEWAY_LOG, () => {
      if (!stopped) debouncedRead();
    });

    watcher.on("error", () => {
      // File may have been deleted; fall back to polling
      watcher?.close();
      watcher = null;
      if (!stopped) waitForFile();
    });
  }

  function waitForFile(): void {
    if (stopped) return;
    if (existsSync(GATEWAY_LOG)) {
      startWatching();
      return;
    }
    pollTimer = setTimeout(() => waitForFile(), POLL_INTERVAL_MS);
  }

  // Kick off
  waitForFile();

  return () => {
    stopped = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (pollTimer) clearTimeout(pollTimer);
    watcher?.close();
  };
}
