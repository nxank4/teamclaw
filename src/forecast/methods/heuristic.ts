/**
 * Heuristic forecast method — wraps the existing preview estimator.
 * Used when no historical data or profile data is available.
 */

import type { PreviewTask } from "../../graph/preview/types.js";
import type { AgentForecast, PhaseForecast, ForecastPhase } from "../types.js";
import { getModelPricing, computeTokenCost } from "../pricing.js";
import type { ModelPricing } from "../types.js";

// Average tokens per task type (rough estimates)
const AVG_TOKENS_SIMPLE = 2000;
const AVG_TOKENS_COMPLEX = 6000;
const INPUT_OUTPUT_RATIO = 3; // 3:1 input:output

export interface HeuristicResult {
  estimatedMinUSD: number;
  estimatedMaxUSD: number;
  estimatedMidUSD: number;
  agentForecasts: AgentForecast[];
  phaseForecasts: PhaseForecast[];
}

/**
 * Estimate cost using simple task complexity heuristics.
 * This is the fallback method when no historical or profile data exists.
 */
export function forecastHeuristic(
  tasks: PreviewTask[],
  model: string,
  pricingOverrides?: Record<string, ModelPricing>,
): HeuristicResult {
  const pricing = getModelPricing(model, pricingOverrides);

  // Group tasks by assigned agent
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
    let estimatedTokens = 0;
    for (const task of agentTaskList) {
      const isComplex = task.complexity === "HIGH" || task.complexity === "ARCHITECTURE";
      estimatedTokens += isComplex ? AVG_TOKENS_COMPLEX : AVG_TOKENS_SIMPLE;
    }

    const outputTokens = Math.round(estimatedTokens / INPUT_OUTPUT_RATIO);
    const inputTokens = estimatedTokens - outputTokens;
    const baseCost = computeTokenCost(inputTokens, outputTokens, pricing);

    // Min/max: ±30% variance for heuristic
    const minCost = baseCost * 0.7;
    const maxCost = baseCost * 1.3;

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

  const phaseForecasts = estimatePhases(tasks, pricing);

  return {
    estimatedMinUSD: round(totalMin),
    estimatedMaxUSD: round(totalMax),
    estimatedMidUSD: round((totalMin + totalMax) / 2),
    agentForecasts,
    phaseForecasts,
  };
}

function estimatePhases(tasks: PreviewTask[], pricing: ModelPricing): PhaseForecast[] {
  const phases: PhaseForecast[] = [];

  // Planning phase — fixed overhead
  const planningTokens = 1500;
  const planningCost = computeTokenCost(planningTokens, 500, pricing);
  phases.push({
    phase: "planning",
    estimatedMinUSD: round(planningCost * 0.8),
    estimatedMaxUSD: round(planningCost * 1.2),
    estimatedTasks: 1,
  });

  // Execution phase — bulk of the cost
  const execTasks = tasks.length;
  const execTokens = tasks.reduce((sum, t) => {
    const isComplex = t.complexity === "HIGH" || t.complexity === "ARCHITECTURE";
    return sum + (isComplex ? AVG_TOKENS_COMPLEX : AVG_TOKENS_SIMPLE);
  }, 0);
  const execCost = computeTokenCost(
    Math.round(execTokens * 0.75),
    Math.round(execTokens * 0.25),
    pricing,
  );
  phases.push({
    phase: "execution",
    estimatedMinUSD: round(execCost * 0.7),
    estimatedMaxUSD: round(execCost * 1.3),
    estimatedTasks: execTasks,
  });

  // Review phase — ~10% of execution
  phases.push({
    phase: "review",
    estimatedMinUSD: round(execCost * 0.05),
    estimatedMaxUSD: round(execCost * 0.15),
    estimatedTasks: Math.ceil(execTasks * 0.5),
  });

  // Rework phase — estimate 1 rework per 5 tasks
  const estimatedReworks = Math.max(1, Math.round(execTasks / 5));
  const reworkCost = computeTokenCost(AVG_TOKENS_SIMPLE, AVG_TOKENS_SIMPLE / 3, pricing);
  phases.push({
    phase: "rework",
    estimatedMinUSD: 0,
    estimatedMaxUSD: round(reworkCost * estimatedReworks),
    estimatedTasks: estimatedReworks,
  });

  return phases;
}

function round(v: number): number {
  return Math.round(v * 10000) / 10000;
}
