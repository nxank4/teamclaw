import { describe, it, expect } from "vitest";
import { forecastHistorical } from "../src/forecast/methods/historical.js";
import type { SimilarRun } from "../src/forecast/types.js";
import type { PreviewTask } from "../src/graph/preview/types.js";

const tasks: PreviewTask[] = [
  { task_id: "t-1", description: "Implement feature", assigned_to: "worker_task", complexity: "MEDIUM", dependencies: [] },
];

const baseRuns: SimilarRun[] = [
  { sessionId: "s1", goal: "Build auth", totalCostUSD: 0.10, averageConfidence: 0.8, totalRuns: 1, teamComposition: ["worker"], similarity: 0.9 },
  { sessionId: "s2", goal: "Build auth", totalCostUSD: 0.12, averageConfidence: 0.85, totalRuns: 1, teamComposition: ["worker"], similarity: 0.85 },
  { sessionId: "s3", goal: "Build auth", totalCostUSD: 0.09, averageConfidence: 0.82, totalRuns: 1, teamComposition: ["worker"], similarity: 0.88 },
];

describe("forecastHistorical", () => {
  it("returns null when < 3 similar runs", () => {
    const result = forecastHistorical(tasks, baseRuns.slice(0, 2), "new-sess", "sonnet");
    expect(result).toBeNull();
  });

  it("correctly excludes current session runs", () => {
    const runsWithCurrent = [
      ...baseRuns,
      { sessionId: "new-sess", goal: "Build auth", totalCostUSD: 0.05, averageConfidence: 0.9, totalRuns: 1, teamComposition: ["worker"], similarity: 0.99 },
    ];
    // Only 3 valid (excluding new-sess) → should work
    const result = forecastHistorical(tasks, runsWithCurrent, "new-sess", "sonnet");
    expect(result).not.toBeNull();
    // If current session was included, the avg would be lower
    expect(result!.similarRunsAvgCost).toBeGreaterThan(0.08);
  });

  it("produces valid cost range from similar runs", () => {
    const result = forecastHistorical(tasks, baseRuns, "new-sess", "sonnet");
    expect(result).not.toBeNull();
    expect(result!.estimatedMinUSD).toBeGreaterThan(0);
    expect(result!.estimatedMaxUSD).toBeGreaterThanOrEqual(result!.estimatedMinUSD);
    expect(result!.similarRunsCount).toBe(3);
  });

  it("weights by similarity", () => {
    const skewedRuns: SimilarRun[] = [
      { sessionId: "s1", goal: "Build auth", totalCostUSD: 0.10, averageConfidence: 0.8, totalRuns: 1, teamComposition: ["worker"], similarity: 0.99 },
      { sessionId: "s2", goal: "Build auth", totalCostUSD: 0.50, averageConfidence: 0.5, totalRuns: 1, teamComposition: ["worker"], similarity: 0.1 },
      { sessionId: "s3", goal: "Build auth", totalCostUSD: 0.50, averageConfidence: 0.5, totalRuns: 1, teamComposition: ["worker"], similarity: 0.1 },
    ];
    const result = forecastHistorical(tasks, skewedRuns, "new-sess", "sonnet");
    // Weighted average should be closer to $0.10 (high similarity run) than $0.50
    expect(result!.estimatedMidUSD).toBeLessThan(0.35);
  });
});
