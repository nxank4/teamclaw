/**
 * Metric extraction — runs a command and extracts a numeric value.
 */

import { execFileSync } from "node:child_process";
import type { MetricConfig } from "./types.js";

export function measureMetric(config: MetricConfig): number {
  // Split command into program and args for execFileSync (no shell injection)
  const parts = config.command.split(/\s+/);
  const cmd = parts[0]!;
  const args = parts.slice(1);

  const output = execFileSync(cmd, args, {
    encoding: "utf-8",
    timeout: 60_000,
    stdio: ["pipe", "pipe", "pipe"],
  });

  return extractValue(output, config.extract);
}

function extractValue(output: string, extract: string): number {
  // Try JSONPath-style extraction (e.g. "$.categories.performance.score")
  if (extract.startsWith("$.")) {
    try {
      const json = JSON.parse(output) as Record<string, unknown>;
      const path = extract.slice(2).split(".");
      let value: unknown = json;
      for (const key of path) {
        if (value == null || typeof value !== "object") break;
        value = (value as Record<string, unknown>)[key];
      }
      const num = Number(value);
      if (Number.isFinite(num)) return num;
    } catch {
      // Fall through to regex
    }
  }

  // Try regex extraction
  try {
    const regex = new RegExp(extract);
    const match = output.match(regex);
    if (match) {
      const num = Number(match[1] ?? match[0]);
      if (Number.isFinite(num)) return num;
    }
  } catch {
    // Invalid regex
  }

  // Last resort: find the first number in the output
  const numMatch = output.match(/[\d]+\.?[\d]*/);
  if (numMatch) {
    const num = Number(numMatch[0]);
    if (Number.isFinite(num)) return num;
  }

  throw new Error(`Could not extract metric from output: ${output.slice(0, 200)}`);
}
