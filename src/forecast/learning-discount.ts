/**
 * Learning discount for multi-run cost projections.
 * Uses actual learning curves when available, otherwise applies default discount.
 */

import type { MultiRunProjection } from "./types.js";

const DEFAULT_DISCOUNT_PER_RUN = 0.10; // 10% discount per subsequent run
const MAX_TOTAL_DISCOUNT = 0.40; // Cap at 40%

export interface LearningCurveData {
  runs: { runIndex: number; averageConfidence: number }[];
}

/**
 * Project multi-run cost with learning discount.
 *
 * If learning curve data is available, uses observed cost reduction rate.
 * Otherwise, uses default 10% per run (capped at 40% total).
 */
export function projectMultiRunCost(
  baseCost: number,
  runs: number,
  learningCurve?: LearningCurveData,
): MultiRunProjection {
  if (runs <= 0) {
    return { runs: 0, naiveCost: 0, projectedCost: 0, savingsPct: 0, savingsUSD: 0, breakEvenRun: 1 };
  }

  if (runs === 1) {
    return { runs: 1, naiveCost: baseCost, projectedCost: baseCost, savingsPct: 0, savingsUSD: 0, breakEvenRun: 1 };
  }

  const naiveCost = baseCost * runs;

  // Determine discount rate per run
  const discountPerRun = learningCurve
    ? computeObservedDiscount(learningCurve)
    : DEFAULT_DISCOUNT_PER_RUN;

  let projectedCost = baseCost; // First run: full price
  for (let i = 2; i <= runs; i++) {
    const cumulativeDiscount = Math.min(discountPerRun * (i - 1), MAX_TOTAL_DISCOUNT);
    projectedCost += baseCost * (1 - cumulativeDiscount);
  }

  projectedCost = round(projectedCost);
  const savingsUSD = round(naiveCost - projectedCost);
  const savingsPct = naiveCost > 0 ? Math.round((savingsUSD / naiveCost) * 100) : 0;

  // Break-even run: when cumulative savings exceed first-run cost
  let breakEvenRun = 1;
  let cumulativeSavings = 0;
  for (let i = 2; i <= runs; i++) {
    const discount = Math.min(discountPerRun * (i - 1), MAX_TOTAL_DISCOUNT);
    cumulativeSavings += baseCost * discount;
    if (cumulativeSavings >= baseCost * 0.5) { // Break even = savings cover half a run
      breakEvenRun = i;
      break;
    }
  }
  if (breakEvenRun === 1 && runs > 1) breakEvenRun = runs; // Worst case

  return {
    runs,
    naiveCost: round(naiveCost),
    projectedCost,
    savingsPct,
    savingsUSD,
    breakEvenRun,
  };
}

/**
 * Compute observed discount rate from learning curve data.
 * Looks at confidence improvement rate as proxy for cost reduction.
 */
function computeObservedDiscount(curve: LearningCurveData): number {
  if (curve.runs.length < 2) return DEFAULT_DISCOUNT_PER_RUN;

  const sorted = [...curve.runs].sort((a, b) => a.runIndex - b.runIndex);
  const first = sorted[0].averageConfidence;
  const last = sorted[sorted.length - 1].averageConfidence;

  if (first === 0) return DEFAULT_DISCOUNT_PER_RUN;

  // Improvement rate = how much confidence improved → proxy for cost reduction
  const improvementRate = (last - first) / first;
  const perRunDiscount = Math.abs(improvementRate) / (sorted.length - 1);

  // Clamp between 5% and 20% per run
  return Math.max(0.05, Math.min(0.20, perRunDiscount));
}

function round(v: number): number {
  return Math.round(v * 10000) / 10000;
}
