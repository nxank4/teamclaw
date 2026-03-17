import { describe, it, expect } from "vitest";
import { buildHandoffData } from "../src/handoff/collector.js";
import type { CollectorInput } from "../src/handoff/collector.js";
import type { Decision } from "../src/journal/types.js";

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: "d1",
    sessionId: "sess_1",
    runIndex: 0,
    capturedAt: Date.now(),
    topic: "auth",
    decision: "Use JWT",
    reasoning: "Stateless",
    recommendedBy: "tech_lead",
    confidence: 0.9,
    taskId: "t1",
    goalContext: "Auth refactor",
    tags: ["auth"],
    embedding: [],
    status: "active",
    ...overrides,
  };
}

function makeInput(overrides: Partial<CollectorInput> = {}): CollectorInput {
  return {
    sessionId: "sess_abc",
    projectPath: "/home/user/app",
    goal: "Refactor auth",
    taskQueue: [],
    nextSprintBacklog: [],
    promotedThisRun: [],
    agentProfiles: [],
    activeDecisions: [],
    rfcDocument: null,
    ...overrides,
  };
}

describe("buildHandoffData", () => {
  it('derives sessionStatus "complete" when all tasks done', () => {
    const input = makeInput({
      taskQueue: [
        { status: "completed", description: "Task A", confidence: 0.9 },
        { status: "completed", description: "Task B", confidence: 0.8 },
      ],
    });
    const result = buildHandoffData(input);
    expect(result.sessionStatus).toBe("complete");
  });

  it('derives sessionStatus "failed" when majority failed', () => {
    const input = makeInput({
      taskQueue: [
        { status: "failed", description: "Task A", confidence: 0 },
        { status: "failed", description: "Task B", confidence: 0 },
        { status: "completed", description: "Task C", confidence: 0.9 },
      ],
    });
    const result = buildHandoffData(input);
    expect(result.sessionStatus).toBe("failed");
  });

  it('derives sessionStatus "partial" when mixed results', () => {
    const input = makeInput({
      taskQueue: [
        { status: "completed", description: "Task A", confidence: 0.9 },
        { status: "completed", description: "Task B", confidence: 0.8 },
        { status: "failed", description: "Task C", confidence: 0 },
      ],
    });
    const result = buildHandoffData(input);
    expect(result.sessionStatus).toBe("partial");
  });

  it("limits activeDecisions to 5", () => {
    const decisions = Array.from({ length: 8 }, (_, i) =>
      makeDecision({ id: `d${i}`, capturedAt: 1000 + i, status: "active" }),
    );
    const input = makeInput({ activeDecisions: decisions });
    const result = buildHandoffData(input);
    expect(result.activeDecisions).toHaveLength(5);
  });

  it("limits teamLearnings to 5", () => {
    const input = makeInput({
      promotedThisRun: ["a", "b", "c", "d", "e", "f", "g"],
    });
    const result = buildHandoffData(input);
    expect(result.teamLearnings).toHaveLength(5);
  });

  it("limits currentState to 5 bullets", () => {
    const input = makeInput({
      taskQueue: Array.from({ length: 10 }, (_, i) => ({
        status: "completed",
        description: `Implement feature ${i}`,
        confidence: 0.9 - i * 0.01,
      })),
    });
    const result = buildHandoffData(input);
    expect(result.currentState.length).toBeLessThanOrEqual(5);
  });

  it("includes escalated items in leftToDo", () => {
    const input = makeInput({
      nextSprintBacklog: [
        { description: "Fix critical bug", escalated: true },
      ],
    });
    const result = buildHandoffData(input);
    expect(result.leftToDo).toContainEqual(
      expect.objectContaining({ type: "escalated", priority: "high" }),
    );
  });

  it("includes approved RFC in leftToDo", () => {
    const input = makeInput({
      rfcDocument: "# Caching Layer RFC\nSome content here",
    });
    const result = buildHandoffData(input);
    expect(result.leftToDo).toContainEqual(
      expect.objectContaining({
        type: "approved_rfc",
        description: expect.stringContaining("Caching Layer RFC"),
      }),
    );
  });
});
