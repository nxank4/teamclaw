/**
 * Historical forecast method — uses actual cost data from similar past runs.
 * Highest confidence method when >= 3 similar past runs are available.
 */

import type { SimilarRun, AgentForecast, PhaseForecast, ModelPricing } from "../types.js";
import type { PreviewTask } from "../../graph/preview/types.js";
import { getModelPricing } from "../pricing.js";

export interface HistoricalResult {
  estimatedMinUSD: number;
  estimatedMaxUSD: number;
  estimatedMidUSD: number;
  similarRunsCount: number;
  similarRunsAvgCost: number;
  similarRunsRange: { min: number; max: number };
  agentForecasts: AgentForecast[];
  phaseForecasts: PhaseForecast[];
}

/**
 * Forecast using similar past sessions.
 * Excludes current session to prevent data leakage.
 */
export function forecastHistorical(
  tasks: PreviewTask[],
  similarRuns: SimilarRun[],
  currentSessionId: string,
  model: string,
  pricingOverrides?: Record<string, ModelPricing>,
): HistoricalResult | null {
  // Filter out current session
  const validRuns = similarRuns.filter((r) => r.sessionId !== currentSessionId);
  if (validRuns.length < 3) return null;

  const costs = validRuns.map((r) => r.totalCostUSD);
  const avgCost = costs.reduce((s, c) => s + c, 0) / costs.length;
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);

  // Adjust for team composition differences
  const taskCount = tasks.length;
  const avgTaskCount = validRuns.reduce((s, r) => s + r.totalRuns, 0) / validRuns.length;
  const taskRatio = avgTaskCount > 0 ? taskCount / avgTaskCount : 1;

  // Weighted average: closer similarity → more weight
  let weightedSum = 0;
  let weightTotal = 0;
  for (const run of validRuns) {
    const weight = run.similarity;
    weightedSum += run.totalCostUSD * weight;
    weightTotal += weight;
  }
  const weightedAvg = weightTotal > 0 ? weightedSum / weightTotal : avgCost;

  const adjusted = weightedAvg * Math.min(taskRatio, 2); // Cap at 2x
  const variance = (maxCost - minCost) / avgCost;

  const estimatedMin = round(adjusted * (1 - variance * 0.5));
  const estimatedMax = round(adjusted * (1 + variance * 0.5));
  const estimatedMid = round(adjusted);

  // Build agent forecasts from task distribution
  const pricing = getModelPricing(model, pricingOverrides);
  const agentForecasts = buildAgentForecasts(tasks, estimatedMid, model, pricing);
  const phaseForecasts = buildPhaseForecasts(estimatedMid);

  return {
    estimatedMinUSD: estimatedMin,
    estimatedMaxUSD: estimatedMax,
    estimatedMidUSD: estimatedMid,
    similarRunsCount: validRuns.length,
    similarRunsAvgCost: round(avgCost),
    similarRunsRange: { min: round(minCost), max: round(maxCost) },
    agentForecasts,
    phaseForecasts,
  };
}

function buildAgentForecasts(
  tasks: PreviewTask[],
  totalCost: number,
  model: string,
  pricing: ModelPricing,
): AgentForecast[] {
  const agentTasks = new Map<string, number>();
  for (const task of tasks) {
    const agent = task.assigned_to || "worker_task";
    agentTasks.set(agent, (agentTasks.get(agent) ?? 0) + 1);
  }

  const total = tasks.length || 1;
  const forecasts: AgentForecast[] = [];

  for (const [agent, count] of agentTasks) {
    const share = count / total;
    const agentCost = totalCost * share;
    const estimatedTokens = Math.round(agentCost / (pricing.inputPer1M / 1_000_000));

    forecasts.push({
      agentRole: agent,
      estimatedTasks: count,
      estimatedTokens,
      estimatedMinUSD: round(agentCost * 0.8),
      estimatedMaxUSD: round(agentCost * 1.2),
      model,
      costPerToken: pricing.inputPer1M / 1_000_000,
    });
  }

  return forecasts;
}

function buildPhaseForecasts(totalCost: number): PhaseForecast[] {
  return [
    { phase: "planning", estimatedMinUSD: round(totalCost * 0.03), estimatedMaxUSD: round(totalCost * 0.05), estimatedTasks: 1 },
    { phase: "execution", estimatedMinUSD: round(totalCost * 0.65), estimatedMaxUSD: round(totalCost * 0.80), estimatedTasks: 0 },
    { phase: "review", estimatedMinUSD: round(totalCost * 0.05), estimatedMaxUSD: round(totalCost * 0.15), estimatedTasks: 0 },
    { phase: "rework", estimatedMinUSD: round(totalCost * 0.02), estimatedMaxUSD: round(totalCost * 0.10), estimatedTasks: 0 },
  ];
}

function round(v: number): number {
  return Math.round(v * 10000) / 10000;
}
