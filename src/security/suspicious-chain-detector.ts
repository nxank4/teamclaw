/**
 * Detect dangerous sequences of tool calls that may indicate hijacked agent.
 */

import type { ChainAlert } from "./types.js";

interface ToolCall {
  toolName: string;
  input?: unknown;
}

export class SuspiciousChainDetector {
  analyze(recentCalls: ToolCall[]): ChainAlert[] {
    const alerts: ChainAlert[] = [];
    if (recentCalls.length < 2) return alerts;

    for (let i = 1; i < recentCalls.length; i++) {
      const prev = recentCalls[i - 1]!;
      const curr = recentCalls[i]!;

      // file_read followed by network shell command
      if (prev.toolName === "file_read" && curr.toolName === "shell_exec") {
        const cmd = typeof curr.input === "object" && curr.input !== null
          ? (curr.input as { command?: string }).command ?? ""
          : "";
        if (/\b(curl|wget|nc|ncat)\b/i.test(cmd)) {
          alerts.push({
            pattern: "file_read then network command",
            severity: "block",
            toolNames: [prev.toolName, curr.toolName],
            description: "Agent read a file then attempted to send data over network",
          });
        }
      }

      // Reading .env then calling external tool
      if (prev.toolName === "file_read") {
        const path = typeof prev.input === "object" && prev.input !== null
          ? (prev.input as { path?: string }).path ?? ""
          : "";
        if (/\.env/.test(path) && ["shell_exec", "web_fetch", "web_search"].includes(curr.toolName)) {
          alerts.push({
            pattern: "env file read then external call",
            severity: "block",
            toolNames: [prev.toolName, curr.toolName],
            description: "Agent read env file then called external tool — potential secret exfiltration",
          });
        }
      }

      // web_fetch followed by file_write
      if (prev.toolName === "web_fetch" && curr.toolName === "file_write") {
        alerts.push({
          pattern: "download then write",
          severity: "warning",
          toolNames: [prev.toolName, curr.toolName],
          description: "Agent downloaded content and wrote to disk",
        });
      }
    }

    // 3+ consecutive shell commands
    let consecutiveShell = 0;
    for (const call of recentCalls) {
      if (call.toolName === "shell_exec") {
        consecutiveShell++;
        if (consecutiveShell >= 3) {
          alerts.push({
            pattern: "3+ consecutive shell commands",
            severity: "warning",
            toolNames: ["shell_exec"],
            description: "Agent running many shell commands without user visibility",
          });
          break;
        }
      } else {
        consecutiveShell = 0;
      }
    }

    return alerts;
  }
}
