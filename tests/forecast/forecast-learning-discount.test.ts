import { describe, it, expect } from "vitest";
import { projectMultiRunCost } from "@/forecast/learning-discount.js";

describe("projectMultiRunCost", () => {
  it("returns base cost for single run", () => {
    const result = projectMultiRunCost(0.10, 1);
    expect(result.projectedCost).toBe(0.10);
    expect(result.savingsPct).toBe(0);
  });

  it("applies correct reduction per run from default discount", () => {
    const result = projectMultiRunCost(0.10, 3);
    // Run 1: $0.10, Run 2: $0.10 * 0.90 = $0.09, Run 3: $0.10 * 0.80 = $0.08
    // Total: $0.27
    expect(result.projectedCost).toBeLessThan(result.naiveCost);
    expect(result.naiveCost).toBe(0.30); // 0.10 * 3
    expect(result.savingsPct).toBeGreaterThan(0);
  });

  it("caps total discount at 40%", () => {
    const result = projectMultiRunCost(0.10, 10);
    // After enough runs, discount caps at 40% — run cost never goes below $0.06
    const minCostPerRun = 0.10 * 0.6; // 40% discount
    const minPossibleTotal = 0.10 + minCostPerRun * 9; // First run full + rest at max discount
    expect(result.projectedCost).toBeGreaterThanOrEqual(minPossibleTotal * 0.99); // Allow rounding
  });

  it("uses observed discount from learning curve data", () => {
    const learningCurve = {
      runs: [
        { runIndex: 1, averageConfidence: 0.6 },
        { runIndex: 2, averageConfidence: 0.7 },
        { runIndex: 3, averageConfidence: 0.8 },
      ],
    };

    const withCurve = projectMultiRunCost(0.10, 3, learningCurve);
    const withoutCurve = projectMultiRunCost(0.10, 3);

    // Both should show savings
    expect(withCurve.projectedCost).toBeLessThan(withCurve.naiveCost);
    // Projections may differ based on the observed learning rate
    expect(withCurve.projectedCost).not.toBe(withoutCurve.projectedCost);
  });

  it("handles zero runs", () => {
    const result = projectMultiRunCost(0.10, 0);
    expect(result.projectedCost).toBe(0);
    expect(result.naiveCost).toBe(0);
  });
});
