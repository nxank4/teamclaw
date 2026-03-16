import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReplayEngine } from "../src/replay/engine.js";
import type { BroadcastEvent, RecordingEvent } from "../src/replay/types.js";
import * as storage from "../src/replay/storage.js";
import * as sessionIndex from "../src/replay/session-index.js";

vi.mock("../src/replay/storage.js");
vi.mock("../src/replay/session-index.js");

const baseTime = 1700000000000;

function makeBroadcastEvents(count: number, nodeNames?: string[]): BroadcastEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `evt-${i}`,
    sessionId: "test-session",
    timestamp: baseTime + i * 1000,
    event: {
      type: "node_event",
      node: nodeNames?.[i] ?? `node-${i}`,
      data: { message: `Event ${i}` },
      state: {},
    },
  }));
}

describe("ReplayEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sessionIndex.getSession).mockReturnValue({
      sessionId: "test-session",
      goal: "Test goal",
      createdAt: baseTime,
      completedAt: baseTime + 60000,
      totalRuns: 1,
      totalCostUSD: 0.1,
      averageConfidence: 0.85,
      recordingPath: "",
      recordingSizeBytes: 1000,
      teamComposition: ["software_engineer"],
    });
  });

  it("loads and plays back events in correct order", async () => {
    const events = makeBroadcastEvents(5);
    vi.mocked(storage.readBroadcastEvents).mockResolvedValue(events);
    vi.mocked(storage.readRecordingEvents).mockResolvedValue([]);

    const emitted: Record<string, unknown>[] = [];
    const emitter = { emit: (event: Record<string, unknown>) => emitted.push(event) };

    const engine = new ReplayEngine({ sessionId: "test-session", speed: 0 }, emitter);
    const result = await engine.load();
    expect(result.ok).toBe(true);

    await engine.play();

    // replay_start + 5 events (each with progress) + replay_complete
    const nodeEvents = emitted.filter((e) => e.type === "node_event");
    expect(nodeEvents).toHaveLength(5);
    expect((nodeEvents[0].node as string)).toBe("node-0");
    expect((nodeEvents[4].node as string)).toBe("node-4");

    expect(emitted[0].type).toBe("replay_start");
    expect(emitted[emitted.length - 1].type).toBe("replay_complete");
  });

  it("seeks to correct position when fromNode is specified", async () => {
    const events = makeBroadcastEvents(5, ["memory", "coordinator", "preview", "worker", "collect"]);
    vi.mocked(storage.readBroadcastEvents).mockResolvedValue(events);
    vi.mocked(storage.readRecordingEvents).mockResolvedValue([]);

    const emitted: Record<string, unknown>[] = [];
    const emitter = { emit: (event: Record<string, unknown>) => emitted.push(event) };

    const engine = new ReplayEngine({ sessionId: "test-session", speed: 0, fromNode: "preview" }, emitter);
    await engine.load();
    await engine.play();

    const nodeEvents = emitted.filter((e) => e.type === "node_event");
    // Should start from "preview" (index 2), so 3 events: preview, worker, collect
    expect(nodeEvents).toHaveLength(3);
    expect((nodeEvents[0].node as string)).toBe("preview");
  });

  it("emits identical WebSocket events to live run format", async () => {
    const events = makeBroadcastEvents(1);
    vi.mocked(storage.readBroadcastEvents).mockResolvedValue(events);
    vi.mocked(storage.readRecordingEvents).mockResolvedValue([]);

    const emitted: Record<string, unknown>[] = [];
    const emitter = { emit: (event: Record<string, unknown>) => emitted.push(event) };

    const engine = new ReplayEngine({ sessionId: "test-session", speed: 0 }, emitter);
    await engine.load();
    await engine.play();

    const nodeEvent = emitted.find((e) => e.type === "node_event");
    expect(nodeEvent).toBeDefined();
    expect(nodeEvent?.type).toBe("node_event");
    expect(nodeEvent?.node).toBeDefined();
    expect(nodeEvent?.data).toBeDefined();
  });

  it("fast-forward emits all events without timing delays", async () => {
    const events = makeBroadcastEvents(10);
    vi.mocked(storage.readBroadcastEvents).mockResolvedValue(events);
    vi.mocked(storage.readRecordingEvents).mockResolvedValue([]);

    const emitted: Record<string, unknown>[] = [];
    const emitter = { emit: (event: Record<string, unknown>) => emitted.push(event) };

    const engine = new ReplayEngine({ sessionId: "test-session", speed: 0 }, emitter);
    await engine.load();

    const start = Date.now();
    await engine.play();
    const elapsed = Date.now() - start;

    // Fast-forward should complete well under 1 second for 10 events
    expect(elapsed).toBeLessThan(1000);
    const nodeEvents = emitted.filter((e) => e.type === "node_event");
    expect(nodeEvents).toHaveLength(10);
  });

  it("applies patches to matching node events", async () => {
    const events = makeBroadcastEvents(3, ["coordinator", "worker", "collect"]);
    vi.mocked(storage.readBroadcastEvents).mockResolvedValue(events);
    vi.mocked(storage.readRecordingEvents).mockResolvedValue([]);

    const emitted: Record<string, unknown>[] = [];
    const emitter = { emit: (event: Record<string, unknown>) => emitted.push(event) };

    const engine = new ReplayEngine({
      sessionId: "test-session",
      speed: 0,
      patch: [{ nodeId: "worker", outputOverride: "patched output" }],
    }, emitter);
    await engine.load();
    await engine.play();

    const workerEvent = emitted.find((e) => e.type === "node_event" && e.node === "worker");
    expect(workerEvent?.patched).toBe(true);
    const data = workerEvent?.data as Record<string, unknown>;
    expect(data?.output).toBe("patched output");
  });

  it("uses recorded outputs before patch node", async () => {
    const events = makeBroadcastEvents(3, ["coordinator", "worker", "collect"]);
    vi.mocked(storage.readBroadcastEvents).mockResolvedValue(events);
    vi.mocked(storage.readRecordingEvents).mockResolvedValue([]);

    const emitted: Record<string, unknown>[] = [];
    const emitter = { emit: (event: Record<string, unknown>) => emitted.push(event) };

    const engine = new ReplayEngine({
      sessionId: "test-session",
      speed: 0,
      patch: [{ nodeId: "worker", outputOverride: "patched" }],
    }, emitter);
    await engine.load();
    await engine.play();

    // Coordinator event should be unpatched
    const coordEvent = emitted.find((e) => e.type === "node_event" && e.node === "coordinator");
    expect(coordEvent?.patched).toBeUndefined();
  });

  it("returns error when session not found", async () => {
    vi.mocked(sessionIndex.getSession).mockReturnValue(null);

    const engine = new ReplayEngine({ sessionId: "nonexistent", speed: 0 }, { emit: () => {} });
    const result = await engine.load();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });
});
