/**
 * Context usage tracker — monitors token utilization in the message history
 * and determines when compaction is needed.
 *
 * Uses the same chars/4 token heuristic as ContextBuilder for consistency.
 */

import type { ContextLevel, ContextSnapshot } from "./types.js";

/** Token estimation: ~4 chars per token for English/code mix. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens for a message array. Works with any object that has a `content` string.
 */
export function estimateMessageTokens(messages: Array<{ content: string }>): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

const THRESHOLDS: Array<{ max: number; level: ContextLevel }> = [
  { max: 70, level: "normal" },
  { max: 80, level: "warning" },
  { max: 85, level: "high" },
  { max: 99, level: "critical" },
  { max: Infinity, level: "emergency" },
];

export class ContextTracker {
  constructor(private maxContextTokens: number) {}

  /**
   * Take a snapshot of current context utilization.
   */
  snapshot(messages: Array<{ content: string }>): ContextSnapshot {
    const estimatedTokens = estimateMessageTokens(messages);
    const utilizationPercent = this.maxContextTokens > 0
      ? Math.round((estimatedTokens / this.maxContextTokens) * 100)
      : 0;
    const level = getLevel(utilizationPercent);

    return {
      estimatedTokens,
      maxTokens: this.maxContextTokens,
      utilizationPercent,
      level,
    };
  }

  /**
   * Should compaction run for this snapshot?
   * True when level is "high" or above.
   */
  shouldCompact(snapshot: ContextSnapshot): boolean {
    return snapshot.level === "high"
      || snapshot.level === "critical"
      || snapshot.level === "emergency";
  }

  /**
   * Update the max context tokens (e.g., when model changes).
   */
  setMaxTokens(maxTokens: number): void {
    this.maxContextTokens = maxTokens;
  }
}

function getLevel(utilizationPercent: number): ContextLevel {
  for (const { max, level } of THRESHOLDS) {
    if (utilizationPercent < max) return level;
  }
  return "emergency";
}
