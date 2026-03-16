/**
 * Format agent profiles as a markdown block for LLM prompt injection.
 */

import type { AgentProfile } from "./types.js";

export function formatProfilesForPrompt(profiles: AgentProfile[]): string {
  if (profiles.length === 0) return "";

  const lines = ["## Agent Performance Profiles", ""];
  for (const p of profiles) {
    const score = (p.overallScore * 100).toFixed(0);
    lines.push(`### ${p.agentRole} (score: ${score}%, ${p.totalTasksCompleted} tasks)`);
    if (p.strengths.length > 0) {
      lines.push(`- **Strengths:** ${p.strengths.join(", ")}`);
    }
    if (p.weaknesses.length > 0) {
      lines.push(`- **Weaknesses:** ${p.weaknesses.join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
