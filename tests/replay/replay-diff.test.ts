import { describe, it, expect, vi, beforeEach } from "vitest";
import { diffSessions } from "@/replay/diff.js";
import * as sessionIndex from "@/replay/session-index.js";
import * as storage from "@/replay/storage.js";
import type { RecordingEvent } from "@/replay/types.js";

vi.mock("@/replay/session-index.js");
vi.mock("@/replay/storage.js");

const baseTime = 1700000000000;

function makeRecordingEvent(nodeId: string, phase: "enter" | "exit", opts?: Partial<RecordingEvent>): RecordingEvent {
  return {
    id: `evt-${nodeId}-${phase}`,
    sessionId: "test",
    runIndex: 1,
    nodeId,
    phase,
    timestamp: baseTime,
    durationMs: phase === "exit" ? 1000 : undefined,
    ...opts,
  };
}

describe("diffSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when sessions not found", async () => {
    vi.mocked(sessionIndex.getSession).mockReturnValue(null);
    const result = await diffSessions("a", "b");
    expect(result).toBeNull();
  });

  it("correctly identifies same/different goals", async () => {
    vi.mocked(sessionIndex.getSession).mockImplementation((id) => ({
      sessionId: id,
      goal: id === "a" ? "Build X" : "Build Y",
      createdAt: baseTime,
      completedAt: baseTime + 60000,
      totalRuns: 1,
      totalCostUSD: 0.1,
      averageConfidence: 0.85,
      recordingPath: "",
      recordingSizeBytes: 100,
      teamComposition: ["software_engineer"],
    }));
    vi.mocked(storage.readRecordingEvents).mockResolvedValue([]);

    const result = await diffSessions("a", "b");
    expect(result).toBeDefined();
    expect(result!.goalSame).toBe(false);
    expect(result!.goalA).toBe("Build X");
    expect(result!.goalB).toBe("Build Y");
  });

  it("identifies added and removed nodes", async () => {
    const sessionEntry = {
      sessionId: "",
      goal: "Test",
      createdAt: baseTime,
      completedAt: baseTime + 60000,
      totalRuns: 1,
      totalCostUSD: 0.1,
      averageConfidence: 0.85,
      recordingPath: "",
      recordingSizeBytes: 100,
      teamComposition: ["software_engineer"],
    };
    vi.mocked(sessionIndex.getSession).mockImplementation((id) => ({ ...sessionEntry, sessionId: id }));

    const eventsA = [
      makeRecordingEvent("coordinator", "exit"),
      makeRecordingEvent("worker", "exit"),
    ];
    const eventsB = [
      makeRecordingEvent("coordinator", "exit"),
      makeRecordingEvent("reviewer", "exit"),
    ];

    vi.mocked(storage.readRecordingEvents).mockImplementation(async (id) =>
      id === "a" ? eventsA : eventsB,
    );

    const result = await diffSessions("a", "b");
    expect(result).toBeDefined();

    const addedNodes = result!.changedNodes.filter((n) => n.changeType === "added");
    const removedNodes = result!.changedNodes.filter((n) => n.changeType === "removed");
    expect(addedNodes.find((n) => n.nodeId === "reviewer")).toBeDefined();
    expect(removedNodes.find((n) => n.nodeId === "worker")).toBeDefined();
  });

  it("identifies changed confidence between sessions", async () => {
    const sessionEntry = {
      sessionId: "",
      goal: "Test",
      createdAt: baseTime,
      completedAt: baseTime + 60000,
      totalRuns: 1,
      totalCostUSD: 0.1,
      averageConfidence: 0.85,
      recordingPath: "",
      recordingSizeBytes: 100,
      teamComposition: ["software_engineer"],
    };
    vi.mocked(sessionIndex.getSession).mockImplementation((id) => ({ ...sessionEntry, sessionId: id }));

    const eventsA = [
      makeRecordingEvent("worker", "exit", {
        agentOutput: { prompt: "test", rawOutput: "output", confidence: { score: 0.7, reasoning: "", flags: [] }, tokensUsed: 100 },
      }),
    ];
    const eventsB = [
      makeRecordingEvent("worker", "exit", {
        agentOutput: { prompt: "test", rawOutput: "output", confidence: { score: 0.95, reasoning: "", flags: [] }, tokensUsed: 100 },
      }),
    ];

    vi.mocked(storage.readRecordingEvents).mockImplementation(async (id) =>
      id === "a" ? eventsA : eventsB,
    );

    const result = await diffSessions("a", "b");
    expect(result).toBeDefined();

    const modified = result!.changedNodes.filter((n) => n.changeType === "modified");
    expect(modified.find((n) => n.nodeId === "worker")).toBeDefined();
    expect(modified.find((n) => n.nodeId === "worker")?.details).toContain("confidence");
  });
});
