/**
 * Inject success pattern context into prompts.
 */

import type { SuccessPattern } from "./types.js";

export function withSuccessContext(prompt: string, patterns: SuccessPattern[]): string {
  if (patterns.length === 0) return prompt;

  const lines = patterns.map((p) => {
    const approvalLabel = p.approvalType === "auto" ? "automatically" : "manually";
    const conf = Math.round(p.confidence * 100) / 100;
    return `- Task: "${p.taskDescription.slice(0, 80)}" | Approach: "${p.approach.slice(0, 120)}" | Confidence: ${conf} | Approved: ${approvalLabel}`;
  });

  const block = `## What has worked well in similar tasks:\n${lines.join("\n")}\nConsider these proven approaches when planning.\n\n`;

  return block + prompt;
}
