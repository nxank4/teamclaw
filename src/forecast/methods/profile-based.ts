/**
 * Profile-based forecast method — estimates cost from agent profiles.
 * Medium confidence method when profiles have >= 5 samples per task type.
 */

import type { AgentForecast, PhaseForecast, ModelPricing } from "../types.js";
import type { PreviewTask } from "../../graph/preview/types.js";
import { getModelPricing, computeTokenCost } from "../pricing.js";

export interface ProfileTaskTypeScore {
  taskType: string;
  averageConfidence: number;
  totalTasksCompleted: number;
  averageReworkCount: number;
}

export interface AgentProfileData {
  agentRole: string;
  taskTypeScores: ProfileTaskTypeScore[];
  overallScore: number;
  totalTasksCompleted: number;
}

export interface ProfileBasedResult {
  estimatedMinUSD: number;
  estimatedMaxUSD: number;
  estimatedMidUSD: number;
  agentForecasts: AgentForecast[];
  phaseForecasts: PhaseForecast[];
}

// Average tokens per task type based on typical patterns
const TASK_TYPE_TOKENS: Record<string, number> = {
  audit: 2500,
  research: 3000,
  implement: 4000,
  test: 2000,
  refactor: 3500,
  document: 2000,
  design: 5000,
  debug: 3000,
  general: 2500,
};

const MIN_SAMPLES_PER_TYPE = 5;
const INPUT_OUTPUT_RATIO = 3;

/**
 * Forecast using agent profile data.
 * Returns null if profiles lack sufficient samples.
 */
export function forecastProfileBased(
  tasks: PreviewTask[],
  profiles: AgentProfileData[],
  model: string,
  pricingOverrides?: Record<string, ModelPricing>,
): ProfileBasedResult | null {
  if (profiles.length === 0) return null;

  // Check if we have enough samples
  const hasEnoughData = profiles.some((p) =>
    p.taskTypeScores.some((ts) => ts.totalTasksCompleted >= MIN_SAMPLES_PER_TYPE),
  );
  if (!hasEnoughData) return null;

  const pricing = getModelPricing(model, pricingOverrides);

  // Group tasks by agent
  const agentTasks = new Map<string, PreviewTask[]>();
  for (const task of tasks) {
    const agent = task.assigned_to || "worker_task";
    const existing = agentTasks.get(agent) ?? [];
    existing.push(task);
    agentTasks.set(agent, existing);
  }

  const agentForecasts: AgentForecast[] = [];
  let totalMin = 0;
  let totalMax = 0;

  for (const [agent, agentTaskList] of agentTasks) {
    const profile = profiles.find((p) => p.agentRole === agent);

    let estimatedTokens = 0;
    let estimatedReworks = 0;

    for (const task of agentTaskList) {
      const taskType = classifyTaskType(task.description);
      const typeTokens = TASK_TYPE_TOKENS[taskType] ?? TASK_TYPE_TOKENS.general;

      // Adjust tokens based on profile: higher confidence → fewer retries → fewer tokens
      const profileScore = profile?.taskTypeScores.find((ts) => ts.taskType === taskType);
      const confidenceFactor = profileScore
        ? 1 + (1 - profileScore.averageConfidence) * 0.5 // Lower confidence = more tokens
        : 1.2; // No profile data = assume 20% overhead
      const reworkRate = profileScore?.averageReworkCount ?? 0.5;

      estimatedTokens += Math.round(typeTokens * confidenceFactor);
      estimatedReworks += reworkRate;
    }

    // Add rework token estimate
    estimatedTokens += Math.round(estimatedReworks * 2000);

    const outputTokens = Math.round(estimatedTokens / INPUT_OUTPUT_RATIO);
    const inputTokens = estimatedTokens - outputTokens;
    const baseCost = computeTokenCost(inputTokens, outputTokens, pricing);

    // Profile-based: ±20% variance
    const minCost = baseCost * 0.8;
    const maxCost = baseCost * 1.2;

    agentForecasts.push({
      agentRole: agent,
      estimatedTasks: agentTaskList.length,
      estimatedTokens,
      estimatedMinUSD: round(minCost),
      estimatedMaxUSD: round(maxCost),
      model,
      costPerToken: pricing.inputPer1M / 1_000_000,
    });

    totalMin += minCost;
    totalMax += maxCost;
  }

  const totalMid = (totalMin + totalMax) / 2;
  const phaseForecasts = buildPhaseForecasts(totalMid, tasks.length);

  return {
    estimatedMinUSD: round(totalMin),
    estimatedMaxUSD: round(totalMax),
    estimatedMidUSD: round(totalMid),
    agentForecasts,
    phaseForecasts,
  };
}

function buildPhaseForecasts(totalCost: number, taskCount: number): PhaseForecast[] {
  return [
    { phase: "planning", estimatedMinUSD: round(totalCost * 0.03), estimatedMaxUSD: round(totalCost * 0.06), estimatedTasks: 1 },
    { phase: "execution", estimatedMinUSD: round(totalCost * 0.65), estimatedMaxUSD: round(totalCost * 0.80), estimatedTasks: taskCount },
    { phase: "review", estimatedMinUSD: round(totalCost * 0.05), estimatedMaxUSD: round(totalCost * 0.15), estimatedTasks: Math.ceil(taskCount * 0.5) },
    { phase: "rework", estimatedMinUSD: round(totalCost * 0.02), estimatedMaxUSD: round(totalCost * 0.10), estimatedTasks: Math.max(1, Math.round(taskCount / 5)) },
  ];
}

function classifyTaskType(description: string): string {
  const lower = description.toLowerCase();
  const keywords: Record<string, string[]> = {
    audit: ["audit", "review", "inspect"],
    research: ["research", "investigate", "analyze"],
    implement: ["implement", "build", "create", "develop", "code"],
    test: ["test", "validate", "spec"],
    refactor: ["refactor", "clean", "optimize"],
    document: ["document", "docs", "readme"],
    design: ["design", "architect", "plan"],
    debug: ["debug", "fix", "resolve"],
  };
  for (const [type, kws] of Object.entries(keywords)) {
    if (kws.some((kw) => lower.includes(kw))) return type;
  }
  return "general";
}

function round(v: number): number {
  return Math.round(v * 10000) / 10000;
}
