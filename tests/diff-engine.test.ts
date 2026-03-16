import { describe, it, expect } from "vitest";
import { computeRunDiff, extractRunSnapshot } from "../src/diff/engine.js";
import type { RunSnapshot, TaskSnapshot } from "../src/diff/types.js";

function makeTask(overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    taskId: "t-1",
    description: "Default task",
    assignedTo: "worker-0",
    status: "completed",
    confidence: 0.85,
    reworkCount: 0,
    approvalStatus: "auto_approved",
    durationMs: 5000,
    costUSD: 0.01,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    sessionId: "sess-1",
    runIndex: 1,
    tasks: [],
    averageConfidence: 0.8,
    totalCostUSD: 0.1,
    totalDurationMs: 60000,
    totalReworks: 0,
    autoApprovedCount: 2,
    team: ["coordinator", "worker_task"],
    patternsRetrieved: 0,
    newPatternsStored: 3,
    globalPromotions: 0,
    lessonsApplied: [],
    ...overrides,
  };
}

describe("computeRunDiff", () => {
  it("identifies unchanged tasks", () => {
    const task = makeTask();
    const from = makeSnapshot({ runIndex: 1, tasks: [task] });
    const to = makeSnapshot({ runIndex: 2, tasks: [task] });

    const diff = computeRunDiff(from, to);
    expect(diff.taskDiffs).toHaveLength(1);
    expect(diff.taskDiffs[0].status).toBe("unchanged");
  });

  it("identifies added tasks", () => {
    const from = makeSnapshot({ runIndex: 1, tasks: [] });
    const to = makeSnapshot({ runIndex: 2, tasks: [makeTask({ taskId: "t-new" })] });

    const diff = computeRunDiff(from, to);
    const added = diff.taskDiffs.filter((t) => t.status === "added");
    expect(added).toHaveLength(1);
    expect(added[0].taskId).toBe("t-new");
  });

  it("identifies removed tasks", () => {
    const from = makeSnapshot({ runIndex: 1, tasks: [makeTask({ taskId: "t-old" })] });
    const to = makeSnapshot({ runIndex: 2, tasks: [] });

    const diff = computeRunDiff(from, to);
    const removed = diff.taskDiffs.filter((t) => t.status === "removed");
    expect(removed).toHaveLength(1);
    expect(removed[0].taskId).toBe("t-old");
  });

  it("identifies changed tasks with confidence delta", () => {
    const from = makeSnapshot({
      runIndex: 1,
      tasks: [makeTask({ confidence: 0.7 })],
    });
    const to = makeSnapshot({
      runIndex: 2,
      tasks: [makeTask({ confidence: 0.9 })],
    });

    const diff = computeRunDiff(from, to);
    expect(diff.taskDiffs[0].status).toBe("changed");
    expect(diff.taskDiffs[0].confidenceDelta).toBe(0.2);
  });

  it("computes all MetricDiff deltas", () => {
    const from = makeSnapshot({
      runIndex: 1,
      averageConfidence: 0.7,
      totalCostUSD: 0.15,
      totalDurationMs: 120000,
      totalReworks: 3,
      autoApprovedCount: 2,
    });
    const to = makeSnapshot({
      runIndex: 2,
      averageConfidence: 0.85,
      totalCostUSD: 0.1,
      totalDurationMs: 90000,
      totalReworks: 1,
      autoApprovedCount: 4,
    });

    const diff = computeRunDiff(from, to);
    expect(diff.metricDiffs.averageConfidenceDelta).toBe(0.15);
    expect(diff.metricDiffs.totalCostDelta).toBe(-0.05);
    expect(diff.metricDiffs.totalDurationDelta).toBe(-30000);
    expect(diff.metricDiffs.reworkCountDelta).toBe(-2);
    expect(diff.metricDiffs.autoApprovedDelta).toBe(2);
  });

  it("computes memory diff", () => {
    const from = makeSnapshot({ patternsRetrieved: 0, newPatternsStored: 4, globalPromotions: 0 });
    const to = makeSnapshot({ patternsRetrieved: 3, newPatternsStored: 2, globalPromotions: 1 });

    const diff = computeRunDiff(from, to);
    expect(diff.memoryDiff.patternsRetrievedDelta).toBe(3);
    expect(diff.memoryDiff.newPatternsStoredDelta).toBe(-2);
    expect(diff.memoryDiff.globalPromotionsDelta).toBe(1);
  });

  it("detects routing changes", () => {
    const from = makeSnapshot({
      tasks: [makeTask({ taskId: "t-1", assignedTo: "worker-0", confidence: 0.5 })],
    });
    const to = makeSnapshot({
      tasks: [makeTask({ taskId: "t-1", assignedTo: "worker-1", confidence: 0.9 })],
    });

    const diff = computeRunDiff(from, to);
    expect(diff.routingDiffs).toHaveLength(1);
    expect(diff.routingDiffs[0].fromAgent).toBe("worker-0");
    expect(diff.routingDiffs[0].toAgent).toBe("worker-1");
  });

  it("computes team diff", () => {
    const from = makeSnapshot({ team: ["coordinator", "worker_task", "rfc_phase"] });
    const to = makeSnapshot({ team: ["coordinator", "worker_task", "system_design"] });

    const diff = computeRunDiff(from, to);
    expect(diff.teamDiff.agentsAdded).toEqual(["system_design"]);
    expect(diff.teamDiff.agentsRemoved).toEqual(["rfc_phase"]);
    expect(diff.teamDiff.unchanged).toContain("coordinator");
  });
});

describe("extractRunSnapshot", () => {
  it("extracts snapshot from GraphState", () => {
    const state: Record<string, unknown> = {
      task_queue: [
        {
          task_id: "t-1",
          description: "Build auth",
          assigned_to: "bot-0",
          status: "completed",
          result: { confidence: { score: 0.88 }, routing_decision: "auto_approved" },
          retry_count: 0,
          timebox_minutes: 5,
        },
      ],
      approval_stats: { autoApprovedCount: 1 },
      average_confidence: 0.88,
      memory_context: { successPatterns: [{ taskDescription: "prior auth task" }], failureLessons: [] },
      new_success_patterns: ["p1"],
      promoted_this_run: [],
      team: [{ role_id: "worker_task" }],
    };

    const snapshot = extractRunSnapshot("sess-1", 1, state, 1000, 61000);

    expect(snapshot.sessionId).toBe("sess-1");
    expect(snapshot.runIndex).toBe(1);
    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.tasks[0].confidence).toBe(0.88);
    expect(snapshot.averageConfidence).toBe(0.88);
    expect(snapshot.autoApprovedCount).toBe(1);
    expect(snapshot.patternsRetrieved).toBe(1);
    expect(snapshot.newPatternsStored).toBe(1);
    expect(snapshot.totalDurationMs).toBe(60000);
  });

  it("handles empty state", () => {
    const snapshot = extractRunSnapshot("sess-1", 1, {}, 0, 0);
    expect(snapshot.tasks).toEqual([]);
    expect(snapshot.averageConfidence).toBe(0);
  });
});
