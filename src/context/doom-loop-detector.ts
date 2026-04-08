/**
 * Doom-loop detector — prevents agents from calling the same tool
 * with identical parameters repeatedly, burning tokens and getting stuck.
 *
 * Uses a sliding window of the last 20 tool calls per agent.
 * Verdicts: 1-2 identical calls = allow, 3 = warn, 4+ = block.
 */

import { createHash } from "node:crypto";
import type { ToolCallFingerprint, DoomLoopVerdict } from "./types.js";

const WINDOW_SIZE = 20;
const WARN_THRESHOLD = 3;
const BLOCK_THRESHOLD = 4;

export class DoomLoopDetector {
  private windows = new Map<string, ToolCallFingerprint[]>();

  /**
   * Compute a stable fingerprint for a tool call.
   * Sorts object keys so `{a:1, b:2}` and `{b:2, a:1}` produce the same hash.
   */
  fingerprint(toolName: string, params: Record<string, unknown>): string {
    const sorted = JSON.stringify(params, Object.keys(params).sort());
    return createHash("md5").update(`${toolName}:${sorted}`).digest("hex");
  }

  /**
   * Record a tool call and return a verdict.
   */
  track(
    agentId: string,
    toolName: string,
    params: Record<string, unknown>,
  ): DoomLoopVerdict {
    const hash = this.fingerprint(toolName, params);
    const window = this.getWindow(agentId);

    window.push({ hash, toolName, timestamp: Date.now() });

    // Evict oldest if over window size
    if (window.length > WINDOW_SIZE) {
      window.splice(0, window.length - WINDOW_SIZE);
    }

    const count = this.countConsecutiveTail(window, hash);

    if (count >= BLOCK_THRESHOLD) {
      return {
        action: "block",
        message: `Tool call blocked: ${toolName} called ${count} times with identical parameters. Stopping to prevent infinite loop. Please try a different approach.`,
        count,
      };
    }

    if (count >= WARN_THRESHOLD) {
      return {
        action: "warn",
        message: `[system] You have called ${toolName} with the same parameters ${count} times. The result is unlikely to change. Consider a different approach or ask the user for help.`,
        count,
      };
    }

    return { action: "allow" };
  }

  /**
   * Reset the sliding window for a specific agent, or all agents if no ID given.
   */
  reset(agentId?: string): void {
    if (agentId) {
      this.windows.delete(agentId);
    } else {
      this.windows.clear();
    }
  }

  /**
   * Get stats for debugging/logging.
   */
  getStats(): { totalCalls: number; uniqueFingerprints: number; agents: number } {
    let totalCalls = 0;
    const uniqueHashes = new Set<string>();

    for (const window of this.windows.values()) {
      totalCalls += window.length;
      for (const fp of window) {
        uniqueHashes.add(fp.hash);
      }
    }

    return {
      totalCalls,
      uniqueFingerprints: uniqueHashes.size,
      agents: this.windows.size,
    };
  }

  private getWindow(agentId: string): ToolCallFingerprint[] {
    let window = this.windows.get(agentId);
    if (!window) {
      window = [];
      this.windows.set(agentId, window);
    }
    return window;
  }

  /**
   * Count how many consecutive entries at the tail of the window
   * share the given fingerprint hash.
   */
  private countConsecutiveTail(window: ToolCallFingerprint[], hash: string): number {
    let count = 0;
    for (let i = window.length - 1; i >= 0; i--) {
      if (window[i]!.hash === hash) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }
}
