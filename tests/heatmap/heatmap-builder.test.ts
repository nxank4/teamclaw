import { describe, it, expect } from "vitest";
import { buildHeatmap } from "@/heatmap/builder.js";
import type { AgentUtilization } from "@/heatmap/types.js";

function makeUtilization(overrides: Partial<AgentUtilization> = {}): AgentUtilization {
  return {
    agentRole: "worker_task",
    sessionId: "sess-1",
    runIndex: 1,
    tasksHandled: 3,
    totalActiveMs: 15000,
    totalWallMs: 30000,
    utilizationPct: 0.5,
    averageDurationMs: 5000,
    maxDurationMs: 8000,
    minDurationMs: 3000,
    averageConfidence: 0.85,
    totalCostUSD: 0.005,
    costPerTask: 0.0017,
    tokensUsed: 1500,
    bottleneckScore: 0.4,
    queueDepth: 1,
    taskTypeBreakdown: [
      { taskType: "implement", count: 2, avgDurationMs: 6000, avgConfidence: 0.88 },
      { taskType: "test", count: 1, avgDurationMs: 3000, avgConfidence: 0.8 },
    ],
    ...overrides,
  };
}

describe("buildHeatmap", () => {
  it("produces correct grid with rows, columns, cells", () => {
    const utils = [
      makeUtilization({ agentRole: "worker_task" }),
      makeUtilization({ agentRole: "coordinator", utilizationPct: 0.1, tasksHandled: 1, taskTypeBreakdown: [{ taskType: "general", count: 1, avgDurationMs: 2000, avgConfidence: 0 }] }),
    ];

    const heatmap = buildHeatmap(utils, "run");

    expect(heatmap.rows).toHaveLength(2);
    expect(heatmap.columns.length).toBeGreaterThanOrEqual(1);
    expect(heatmap.cells).toHaveLength(2);

    // Each row should have same number of cells as columns
    for (const row of heatmap.cells) {
      expect(row).toHaveLength(heatmap.columns.length);
    }
  });

  it("correctly maps intensity values 0-1 per cell", () => {
    const utils = [makeUtilization()];
    const heatmap = buildHeatmap(utils, "run", { metric: "confidence" });

    for (const row of heatmap.cells) {
      for (const cell of row) {
        expect(cell.value).toBeGreaterThanOrEqual(0);
        expect(cell.value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("marks bottleneck rows correctly", () => {
    const utils = [
      makeUtilization({ agentRole: "worker_task", utilizationPct: 0.9, queueDepth: 3 }),
      makeUtilization({ agentRole: "coordinator", utilizationPct: 0.1, queueDepth: 0 }),
    ];

    const heatmap = buildHeatmap(utils, "run");

    const workerRow = heatmap.rows.find((r) => r.agentRole === "worker_task");
    const coordRow = heatmap.rows.find((r) => r.agentRole === "coordinator");
    expect(workerRow!.isBottleneck).toBe(true);
    expect(coordRow!.isBottleneck).toBe(false);
  });

  it("detects bottleneck alerts", () => {
    const utils = [
      makeUtilization({ agentRole: "worker_task", utilizationPct: 0.85, queueDepth: 3 }),
    ];

    const heatmap = buildHeatmap(utils, "run");
    expect(heatmap.bottlenecks).toHaveLength(1);
    expect(heatmap.bottlenecks[0].agentRole).toBe("worker_task");
  });

  it("handles empty utilization array", () => {
    const heatmap = buildHeatmap([], "run");
    expect(heatmap.rows).toHaveLength(0);
    expect(heatmap.columns).toHaveLength(0);
    expect(heatmap.cells).toHaveLength(0);
  });

  it("supports run view type for multi-run", () => {
    const utils = [
      makeUtilization({ agentRole: "worker_task", runIndex: 1 }),
      makeUtilization({ agentRole: "worker_task", runIndex: 2, utilizationPct: 0.7 }),
    ];

    const heatmap = buildHeatmap(utils, "session", { viewType: "run" });
    expect(heatmap.columns.some((c) => c.label === "Run 1")).toBe(true);
    expect(heatmap.columns.some((c) => c.label === "Run 2")).toBe(true);
  });

  it("supports time bucket view type", () => {
    const utils = [makeUtilization()];
    const heatmap = buildHeatmap(utils, "run", { viewType: "time_bucket", timeBuckets: 5 });
    expect(heatmap.columns).toHaveLength(5);
    expect(heatmap.columns[0].type).toBe("time_bucket");
  });
});
