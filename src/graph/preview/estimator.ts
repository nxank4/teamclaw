/**
 * Cost & wave estimator for sprint preview.
 */

import type { CostEstimate, PreviewTask } from "./types.js";

export interface CostConfig {
  costSimple: number;
  costComplex: number;
}

const DEFAULT_COST: CostConfig = { costSimple: 0.02, costComplex: 0.06 };

/**
 * Calculate how many parallel execution waves a set of tasks requires.
 * Wave 1 = tasks with no deps, Wave N+1 = tasks whose deps are all in Wave <= N.
 */
export function calculateWaves(tasks: PreviewTask[]): number {
  if (tasks.length === 0) return 0;

  const waveOf = new Map<string, number>();
  let changed = true;

  while (changed) {
    changed = false;
    for (const task of tasks) {
      if (waveOf.has(task.task_id)) continue;
      const deps = task.dependencies ?? [];
      if (deps.length === 0) {
        waveOf.set(task.task_id, 1);
        changed = true;
      } else if (deps.every((d) => waveOf.has(d))) {
        const maxDepWave = Math.max(...deps.map((d) => waveOf.get(d)!));
        waveOf.set(task.task_id, maxDepWave + 1);
        changed = true;
      }
    }
  }

  // Tasks with unresolvable deps get wave = max+1
  const maxWave = waveOf.size > 0 ? Math.max(...waveOf.values()) : 0;
  for (const task of tasks) {
    if (!waveOf.has(task.task_id)) {
      waveOf.set(task.task_id, maxWave + 1);
    }
  }

  return waveOf.size > 0 ? Math.max(...waveOf.values()) : 0;
}

/**
 * Estimate cost, parallel waves, and time for a set of tasks.
 */
export function estimateCost(
  tasks: PreviewTask[],
  config: Partial<CostConfig> = {},
): CostEstimate {
  const costSimple = config.costSimple ?? DEFAULT_COST.costSimple;
  const costComplex = config.costComplex ?? DEFAULT_COST.costComplex;

  let totalUSD = 0;
  let rfcRequired = false;

  for (const task of tasks) {
    const isComplex =
      task.complexity === "HIGH" || task.complexity === "ARCHITECTURE";
    totalUSD += isComplex ? costComplex : costSimple;
    if (isComplex) rfcRequired = true;
  }

  const parallelWaves = calculateWaves(tasks);
  const estimatedMinutes = parallelWaves * 2;

  return {
    estimatedUSD: Math.round(totalUSD * 100) / 100,
    parallelWaves,
    rfcRequired,
    estimatedMinutes,
  };
}
