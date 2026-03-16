import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SessionRecorder, wrapWithRecording, wrapSyncWithRecording } from "../src/replay/recorder.js";
import type { GraphState } from "../src/core/graph-state.js";
import * as storage from "../src/replay/storage.js";

vi.mock("../src/replay/storage.js", () => ({
  appendRecordingEvent: vi.fn(),
  appendBroadcastEvent: vi.fn(),
}));

const mockState = {
  cycle_count: 1,
  task_queue: [{ task_id: "t1", status: "pending" }],
  bot_stats: {},
  user_goal: "test goal",
  __node__: null,
  average_confidence: 0.8,
  total_tasks: 1,
  completed_tasks: 0,
  teamComposition: null,
} as unknown as GraphState;

describe("SessionRecorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records node enter events", () => {
    const recorder = new SessionRecorder("test-session");
    recorder.recordNodeEnter("coordinator", mockState);

    expect(storage.appendRecordingEvent).toHaveBeenCalledOnce();
    const call = vi.mocked(storage.appendRecordingEvent).mock.calls[0];
    expect(call[0]).toBe("test-session");
    expect(call[1].nodeId).toBe("coordinator");
    expect(call[1].phase).toBe("enter");
    expect(call[1].stateBefore).toBeDefined();
  });

  it("records node exit events with duration", () => {
    const recorder = new SessionRecorder("test-session");
    const startTime = Date.now() - 100;
    recorder.recordNodeExit("coordinator", { __node__: "coordinator" } as Partial<GraphState>, startTime);

    expect(storage.appendRecordingEvent).toHaveBeenCalledOnce();
    const call = vi.mocked(storage.appendRecordingEvent).mock.calls[0];
    expect(call[1].phase).toBe("exit");
    expect(call[1].durationMs).toBeGreaterThanOrEqual(100);
  });

  it("records broadcast events", () => {
    const recorder = new SessionRecorder("test-session");
    recorder.recordBroadcast({ type: "node_event", node: "coordinator" });

    expect(storage.appendBroadcastEvent).toHaveBeenCalledOnce();
    const call = vi.mocked(storage.appendBroadcastEvent).mock.calls[0];
    expect(call[1].event.type).toBe("node_event");
  });

  it("never throws — errors are swallowed", () => {
    vi.mocked(storage.appendRecordingEvent).mockImplementation(() => {
      throw new Error("disk full");
    });

    const recorder = new SessionRecorder("test-session");
    expect(() => recorder.recordNodeEnter("coordinator", mockState)).not.toThrow();
  });

  it("stops recording after stop() is called", () => {
    const recorder = new SessionRecorder("test-session");
    recorder.stop();
    recorder.recordNodeEnter("coordinator", mockState);
    recorder.recordBroadcast({ type: "test" });

    expect(storage.appendRecordingEvent).not.toHaveBeenCalled();
    expect(storage.appendBroadcastEvent).not.toHaveBeenCalled();
  });

  it("tracks run index", () => {
    const recorder = new SessionRecorder("test-session");
    recorder.setRunIndex(3);
    recorder.recordNodeEnter("coordinator", mockState);

    const call = vi.mocked(storage.appendRecordingEvent).mock.calls[0];
    expect(call[1].runIndex).toBe(3);
  });
});

describe("wrapWithRecording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("wraps async node functions with enter/exit recording", async () => {
    const recorder = new SessionRecorder("test-session");
    const nodeFn = vi.fn().mockResolvedValue({ __node__: "coordinator" });
    const wrapped = wrapWithRecording(recorder, "coordinator", nodeFn);

    await wrapped(mockState);

    expect(nodeFn).toHaveBeenCalledOnce();
    expect(storage.appendRecordingEvent).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(storage.appendRecordingEvent).mock.calls;
    expect(calls[0][1].phase).toBe("enter");
    expect(calls[1][1].phase).toBe("exit");
  });
});

describe("wrapSyncWithRecording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("wraps sync node functions with enter/exit recording", () => {
    const recorder = new SessionRecorder("test-session");
    const nodeFn = vi.fn().mockReturnValue({ __node__: "increment_cycle" });
    const wrapped = wrapSyncWithRecording(recorder, "increment_cycle", nodeFn);

    wrapped(mockState);

    expect(nodeFn).toHaveBeenCalledOnce();
    expect(storage.appendRecordingEvent).toHaveBeenCalledTimes(2);
  });
});
