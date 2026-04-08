/**
 * Show execution plan before complex tasks.
 */

import type { PlanPreviewData, PlanStep } from "./types.js";
import type { RouteDecision } from "../router/router-types.js";

export class PlanPreview {
  generatePreview(decision: RouteDecision): PlanPreviewData {
    const steps: PlanStep[] = decision.agents.map((a, i) => ({
      index: i + 1,
      agent: a.role,
      task: a.task || "assigned task",
      tools: a.tools,
      dependsOn: a.dependsOn ? a.dependsOn.map((dep) => {
        const idx = decision.agents.findIndex((x) => x.agentId === dep);
        return idx >= 0 ? idx + 1 : 0;
      }).filter((x) => x > 0) : [],
      parallel: !a.dependsOn?.length,
    }));

    const agents = [...new Set(decision.agents.map((a) => a.role))];
    const tools = [...new Set(decision.agents.flatMap((a) => a.tools))];

    return {
      summary: decision.plan ?? `${agents.length} agents, ${steps.length} steps`,
      steps,
      estimatedCost: decision.estimatedCost ?? 0,
      estimatedDuration: `~${steps.length * 15}s`,
      agents,
      toolsUsed: tools,
    };
  }

  format(preview: PlanPreviewData, _terminalWidth: number): string[] {
    const lines: string[] = [];
    lines.push(`  ── Execution Plan ──`);
    lines.push(`  ${preview.summary}`);
    lines.push("");

    for (const step of preview.steps) {
      const deps = step.dependsOn.length ? ` ← depends on ${step.dependsOn.join(", ")}` : "";
      const par = step.parallel ? " (parallel)" : "";
      lines.push(`  Step ${step.index}: [${step.agent}] ${step.task}${deps}${par}`);
    }

    lines.push("");
    lines.push(`  Agents: ${preview.agents.join(", ")}`);
    lines.push(`  Tools: ${preview.toolsUsed.join(", ")}`);
    lines.push(`  Estimated: ${preview.estimatedDuration} │ ~$${preview.estimatedCost.toFixed(2)}`);

    return lines;
  }
}
