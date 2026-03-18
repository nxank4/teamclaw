import { describe, it, expect } from "vitest";
import { calculateUtilization } from "@/heatmap/calculator.js";
import type { RecordingEvent } from "@/replay/types.js";

function makeEvent(overrides: Partial<RecordingEvent> = {}): RecordingEvent {
  return {
    id: "evt-1",
    sessionId: "sess-1",
    runIndex: 1,
    nodeId: "worker_task",
    phase: "exit",
    timestamp: 1700000010000,
    durationMs: 5000,
    agentOutput: {
      prompt: "do something",
      rawOutput: "done",
      confidence: { score: 0.85, reasoning: "clear", flags: [] },
      tokensUsed: 1000,
    },
    ...overrides,
  };
}

describe("calculateUtilization", () => {
  it("computes utilization from recording events", () => {
    const events: RecordingEvent[] = [
      makeEvent({ id: "e1", nodeId: "worker_task", timestamp: 1700000005000, phase: "enter" }),
      makeEvent({ id: "e1", nodeId: "worker_task", timestamp: 1700000010000, durationMs: 5000 }),
      makeEvent({ id: "e2", nodeId: "coordinator", timestamp: 1700000002000, phase: "enter" }),
      makeEvent({ id: "e2", nodeId: "coordinator", timestamp: 1700000003000, durationMs: 1000, agentOutput: undefined }),
    ];

    const results = calculateUtilization("sess-1", 1, events);
    expect(results.length).toBeGreaterThanOrEqual(1);

    const worker = results.find((r) => r.agentRole === "worker_task");
    expect(worker).toBeDefined();
    expect(worker!.tasksHandled).toBe(1);
    expect(worker!.totalActiveMs).toBe(5000);
    expect(worker!.averageConfidence).toBe(0.85);
    expect(worker!.tokensUsed).toBe(1000);
  });

  it("computes utilizationPct correctly", () => {
    const events: RecordingEvent[] = [
      makeEvent({ id: "e0", nodeId: "coordinator", timestamp: 1700000000000, phase: "enter" }),
      makeEvent({ id: "e0", nodeId: "coordinator", timestamp: 1700000001000, durationMs: 1000 }),
      makeEvent({ id: "e1", nodeId: "worker_task", timestamp: 1700000005000, phase: "enter" }),
      makeEvent({ id: "e1", nodeId: "worker_task", timestamp: 1700000010000, durationMs: 5000 }),
    ];

    const results = calculateUtilization("sess-1", 1, events);
    const worker = results.find((r) => r.agentRole === "worker_task");
    // Wall time: 10000 - 0 = 10000ms, active: 5000ms -> 50%
    expect(worker!.utilizationPct).toBe(0.5);
  });

  it("identifies queue depth from concurrent timing", () => {
    // Two worker tasks overlapping in time
    const events: RecordingEvent[] = [
      makeEvent({ id: "e1", nodeId: "worker_task", timestamp: 1700000005000, phase: "enter" }),
      makeEvent({ id: "e2", nodeId: "worker_task", timestamp: 1700000006000, phase: "enter" }),
      makeEvent({ id: "e1", nodeId: "worker_task", timestamp: 1700000010000, durationMs: 5000 }),
      makeEvent({ id: "e2", nodeId: "worker_task", timestamp: 1700000011000, durationMs: 5000 }),
    ];

    const results = calculateUtilization("sess-1", 1, events);
    const worker = results.find((r) => r.agentRole === "worker_task");
    expect(worker!.queueDepth).toBeGreaterThanOrEqual(2);
  });

  it("computes bottleneck score formula correctly", () => {
    const events: RecordingEvent[] = [
      makeEvent({ id: "e0", nodeId: "coordinator", timestamp: 1700000000000, phase: "enter" }),
      makeEvent({ id: "e0", nodeId: "coordinator", timestamp: 1700000001000, durationMs: 1000 }),
      // Worker is very busy — high utilization
      makeEvent({ id: "e1", nodeId: "worker_task", timestamp: 1700000001000, phase: "enter" }),
      makeEvent({ id: "e1", nodeId: "worker_task", timestamp: 1700000009000, durationMs: 8000 }),
      makeEvent({ id: "e2", nodeId: "worker_task", timestamp: 1700000009000, phase: "enter" }),
      makeEvent({ id: "e2", nodeId: "worker_task", timestamp: 1700000010000, durationMs: 1000 }),
    ];

    const results = calculateUtilization("sess-1", 1, events);
    const worker = results.find((r) => r.agentRole === "worker_task");

    // bottleneckScore = utilizationPct * 0.5 + normalizedQueue * 0.3 + durationRatio * 0.2
    expect(worker!.bottleneckScore).toBeGreaterThan(0);
    expect(worker!.bottleneckScore).toBeLessThanOrEqual(1);
  });

  it("filters events by runIndex", () => {
    const events: RecordingEvent[] = [
      makeEvent({ runIndex: 1, nodeId: "worker_task", timestamp: 1700000010000 }),
      makeEvent({ runIndex: 2, nodeId: "worker_task", timestamp: 1700000020000 }),
    ];

    const run1 = calculateUtilization("sess-1", 1, events);
    const run2 = calculateUtilization("sess-1", 2, events);

    expect(run1.find((r) => r.agentRole === "worker_task")!.tasksHandled).toBe(1);
    expect(run2.find((r) => r.agentRole === "worker_task")!.tasksHandled).toBe(1);
  });

  it("returns empty for no events", () => {
    const results = calculateUtilization("sess-1", 1, []);
    expect(results).toEqual([]);
  });

  it("sorts results by utilization descending", () => {
    const events: RecordingEvent[] = [
      makeEvent({ id: "e0", nodeId: "coordinator", timestamp: 1700000000000, phase: "enter" }),
      makeEvent({ id: "e0", nodeId: "coordinator", timestamp: 1700000001000, durationMs: 1000 }),
      makeEvent({ id: "e1", nodeId: "worker_task", timestamp: 1700000001000, phase: "enter" }),
      makeEvent({ id: "e1", nodeId: "worker_task", timestamp: 1700000010000, durationMs: 9000 }),
    ];

    const results = calculateUtilization("sess-1", 1, events);
    expect(results[0].agentRole).toBe("worker_task"); // Higher utilization
  });
});
