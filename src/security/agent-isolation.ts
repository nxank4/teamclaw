/**
 * Prevent cross-agent prompt manipulation.
 */

import { createHash } from "node:crypto";
import type { IsolationAlert } from "./types.js";

const CROSS_AGENT_PATTERNS = [
  /\[to\s+\w+\]\s*:/gi,
  /instruct\s+(the\s+)?\w+\s+(agent|bot)\s+to/gi,
  /tell\s+(the\s+)?\w+\s+(agent|bot)\s+to/gi,
];

const PROMPT_OVERRIDE_PATTERNS = [
  /update\s+(my|your)\s+instructions/gi,
  /change\s+(my|your)\s+system\s+prompt/gi,
  /modify\s+(my|your)\s+(rules|behavior)/gi,
];

export class AgentIsolation {
  validateOutput(agentId: string, output: string): IsolationAlert[] {
    const alerts: IsolationAlert[] = [];

    for (const pattern of CROSS_AGENT_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(output)) {
        alerts.push({
          type: "cross_agent_instruction",
          agentId,
          detail: `Agent ${agentId} output contains instructions for another agent`,
        });
      }
    }

    for (const pattern of PROMPT_OVERRIDE_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(output)) {
        alerts.push({
          type: "prompt_override",
          agentId,
          detail: `Agent ${agentId} output attempts to modify system prompt`,
        });
      }
    }

    return alerts;
  }

  validateSystemPrompt(agentId: string, expectedHash: string, actual: string): boolean {
    const hash = createHash("sha256").update(actual).digest("hex").slice(0, 16);
    return hash === expectedHash;
  }

  static hashPrompt(prompt: string): string {
    return createHash("sha256").update(prompt).digest("hex").slice(0, 16);
  }
}
