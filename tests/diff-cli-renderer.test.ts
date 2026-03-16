import { describe, it, expect } from "vitest";
import { renderDiffCli, renderRunDiff } from "../src/diff/renderers/cli.js";
import type { DiffChain, RunDiff } from "../src/diff/types.js";

function makeRunDiff(overrides: Partial<RunDiff> = {}): RunDiff {
  return {
    sessionId: "sess-1",
    fromRun: 1,
    toRun: 2,
    taskDiffs: [
      {
        taskId: "t-1",
        description: "Build auth flow",
        status: "changed",
        confidenceDelta: 0.1,
      },
      {
        taskId: "t-2",
        description: "Write tests",
        status: "unchanged",
        confidenceDelta: 0,
      },
      {
        taskId: "t-3",
        description: "Add token refresh",
        status: "added",
        confidenceDelta: 0.88,
      },
      {
        taskId: "t-4",
        description: "Old test task",
        status: "removed",
      },
    ],
    metricDiffs: {
      averageConfidenceDelta: 0.1,
      totalCostDelta: -0.03,
      totalDurationDelta: -30000,
      reworkCountDelta: -2,
      autoApprovedDelta: 2,
      tasksAddedCount: 1,
      tasksRemovedCount: 1,
    },
    memoryDiff: {
      patternsRetrievedDelta: 3,
      newPatternsStoredDelta: -2,
      globalPromotionsDelta: 1,
      lessonsApplied: ["lesson-1"],
    },
    routingDiffs: [],
    teamDiff: {
      agentsAdded: [],
      agentsRemoved: [],
      unchanged: ["coordinator", "worker_task"],
    },
    ...overrides,
  };
}

function makeChain(overrides: Partial<DiffChain> = {}): DiffChain {
  return {
    sessionId: "sess-1",
    totalRuns: 3,
    runDiffs: [makeRunDiff()],
    overallTrend: {
      confidenceTrend: "improving",
      costTrend: "improving",
      learningEfficiency: 0.05,
      plateauDetected: false,
    },
    ...overrides,
  };
}

describe("renderDiffCli", () => {
  it("renders without errors", () => {
    const output = renderDiffCli(makeChain());
    expect(output).toBeTruthy();
    expect(output).toContain("sess-1");
  });

  it("shows correct symbols for task statuses", () => {
    const output = renderRunDiff(makeRunDiff(), {});
    expect(output).toContain("~"); // changed
    expect(output).toContain("+"); // added
    expect(output).toContain("-"); // removed
  });

  it("hides unchanged tasks by default", () => {
    const output = renderRunDiff(makeRunDiff(), {});
    // "=" symbol for unchanged should NOT appear unless verbose
    const lines = output.split("\n");
    const unchangedLines = lines.filter((l) => l.includes("= t-2"));
    expect(unchangedLines).toHaveLength(0);
  });

  it("shows unchanged tasks in verbose mode", () => {
    const output = renderRunDiff(makeRunDiff(), { verbose: true });
    expect(output).toContain("= t-2");
  });

  it("shows memory impact", () => {
    const output = renderRunDiff(makeRunDiff(), {});
    expect(output).toContain("Patterns retrieved");
    expect(output).toContain("+3");
  });

  it("shows team changes when present", () => {
    const diff = makeRunDiff({
      teamDiff: {
        agentsAdded: ["system_design"],
        agentsRemoved: ["rfc_phase"],
        unchanged: ["coordinator"],
      },
    });
    const output = renderRunDiff(diff, {});
    expect(output).toContain("Team changes");
    expect(output).toContain("system_design");
    expect(output).toContain("rfc_phase");
  });

  it("shows routing changes when present", () => {
    const diff = makeRunDiff({
      routingDiffs: [{
        taskId: "t-1",
        fromAgent: "worker-0",
        toAgent: "worker-1",
        reason: "profile-based optimization",
      }],
    });
    const output = renderRunDiff(diff, {});
    expect(output).toContain("Routing changes");
    expect(output).toContain("worker-0");
    expect(output).toContain("worker-1");
  });
});

describe("renderDiffCli overall trend", () => {
  it("shows plateau warning when detected", () => {
    const chain = makeChain({
      overallTrend: {
        confidenceTrend: "stable",
        costTrend: "stable",
        learningEfficiency: 0.005,
        plateauDetected: true,
        plateauMessage: "Plateau detected after run 3",
      },
      runDiffs: [makeRunDiff(), makeRunDiff({ fromRun: 2, toRun: 3 })],
    });
    const output = renderDiffCli(chain);
    expect(output).toContain("Plateau detected");
  });
});
