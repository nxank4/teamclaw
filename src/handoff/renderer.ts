import type { HandoffData } from "./types.js";

const STATUS_EMOJI: Record<HandoffData["sessionStatus"], string> = {
  complete: "\u2705 Complete",
  failed: "\u274C Failed",
  partial: "\u26A0\uFE0F Partial",
};

export function renderContextMarkdown(data: HandoffData): string {
  const date = new Date(data.generatedAt).toISOString().replace("T", " ").replace(/\.\d+Z/, " UTC");
  const lines: string[] = [];

  // Header
  lines.push("# TeamClaw Project Context");
  lines.push(`**Generated:** ${date}`);
  lines.push(`**Session:** ${data.sessionId}`);
  lines.push(`**Project:** ${data.projectPath}`);
  lines.push("", "---", "");

  // Where We Are
  lines.push("## Where We Are");
  lines.push(`Goal: "${data.completedGoal}"`);
  lines.push(`Status: ${STATUS_EMOJI[data.sessionStatus]}`);
  lines.push("");
  lines.push("Current project state:");
  for (const s of data.currentState) {
    lines.push(`- ${s}`);
  }
  lines.push("", "---", "");

  // Active Decisions
  lines.push("## Active Decisions");
  lines.push("These decisions are in effect \u2014 honor them in future sessions:");
  lines.push("");
  data.activeDecisions.forEach((d, i) => {
    lines.push(`${i + 1}. **${d.decision}** (${d.recommendedBy}, ${d.confidence >= 0.8 ? "high" : d.confidence >= 0.5 ? "medium" : "low"} confidence)`);
    lines.push(`   Reasoning: "${d.reasoning}"`);
    lines.push("");
  });
  lines.push("---", "");

  // Left To Do
  lines.push("## Left To Do");
  lines.push("These items are ready to pick up in the next session:");
  lines.push("");
  for (const item of data.leftToDo) {
    const suffix = item.type === "deferred" ? " \u2014 deferred" : item.type === "escalated" ? " \u2014 escalated" : "";
    lines.push(`- [ ] ${item.description}${suffix}`);
  }
  lines.push("", "---", "");

  // What The Team Learned (omit if empty)
  if (data.teamLearnings.length > 0) {
    lines.push("## What The Team Learned");
    lines.push("Lessons from this session (added to global memory):");
    lines.push("");
    for (const l of data.teamLearnings) {
      lines.push(`- ${l}`);
    }
    lines.push("", "---", "");
  }

  // Team Performance (omit if empty)
  if (data.teamPerformance.length > 0) {
    lines.push("## Team Performance");
    for (const p of data.teamPerformance) {
      const note = p.note ? ` \u2014 ${p.note}` : "";
      lines.push(`- ${p.agentRole}: ${p.trend}${note}`);
    }
    lines.push("", "---", "");
  }

  // How To Resume
  lines.push("## How To Resume");
  lines.push("");
  for (const cmd of data.resumeCommands) {
    lines.push("```");
    lines.push(cmd);
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}
