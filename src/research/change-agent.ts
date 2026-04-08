/**
 * Change agent — uses LLM to propose code changes that optimize a metric.
 */

import { createProxyService } from "../proxy/ProxyService.js";
import type { Iteration, ResearchConfig } from "./types.js";

export interface ChangeProposal {
  description: string;
  content: string;
}

export async function proposeChange(
  config: ResearchConfig,
  currentScore: number,
  bestScore: number,
  history: Iteration[],
): Promise<ChangeProposal> {
  const proxy = await createProxyService();

  const historyContext = history.length > 0
    ? `\n\nPrevious iterations:\n${history.slice(-10).map((it) =>
        `  #${it.index}: ${it.description} → ${it.kept ? "✓ kept" : "✗ reverted"} (${it.scoreBefore}→${it.scoreAfter}, ${it.delta > 0 ? "+" : ""}${it.delta})`,
      ).join("\n")}`
    : "";

  const prompt = `You are an optimization agent. Your goal is to improve a metric through code changes.

Metric: ${config.metric.command}
Extraction: ${config.metric.extract}
Direction: ${config.metric.direction}
Current score: ${currentScore}
Best score: ${bestScore}
Allowed files: ${config.change.scope.join(", ")}
${historyContext}

Propose ONE specific code change that could improve the metric. Be precise about what file to modify and exactly what to change. Focus on changes that are likely to have measurable impact.

If previous iterations show a pattern of what works/doesn't work, learn from it.

Respond with:
1. A one-line description of the change
2. The detailed change instructions (file paths, what to add/remove/modify)`;

  let response = "";
  for await (const chunk of proxy.stream(prompt)) {
    response += chunk.content;
  }

  const lines = response.trim().split("\n");
  const description = lines[0] ?? "Code optimization";

  return {
    description: description.replace(/^\d+\.\s*/, ""),
    content: response,
  };
}
