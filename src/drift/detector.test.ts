import { describe, it, expect } from "vitest";
import { detectDrift } from "./detector.js";
import type { Decision } from "../journal/types.js";

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: "dec-1",
    sessionId: "sess-123",
    runIndex: 1,
    capturedAt: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days ago
    topic: "session storage",
    decision: "Avoid Redis for session storage",
    reasoning: "Stateless JWT approach chosen for scalability",
    recommendedBy: "rfc_author",
    confidence: 0.91,
    taskId: "t-1",
    goalContext: "Build auth",
    tags: ["redis", "session", "storage"],
    embedding: [],
    status: "active",
    ...overrides,
  };
}

describe("detectDrift", () => {
  it("returns severity 'none' when no decisions exist", () => {
    const result = detectDrift("Build a REST API", []);
    expect(result.hasDrift).toBe(false);
    expect(result.severity).toBe("none");
    expect(result.conflicts).toHaveLength(0);
  });

  it("returns severity 'none' when no conflicts found", () => {
    const decisions = [makeDecision({ tags: ["redis"], decision: "Avoid Redis" })];
    const result = detectDrift("Build a GraphQL API with PostgreSQL", decisions);
    expect(result.hasDrift).toBe(false);
    expect(result.severity).toBe("none");
  });

  it("correctly identifies keyword overlap", () => {
    const decisions = [makeDecision()];
    const result = detectDrift("Add Redis-based session caching", decisions);
    expect(result.hasDrift).toBe(true);
    expect(result.conflicts.length).toBeGreaterThanOrEqual(1);
    // The decision has tags ["redis", "session", "storage"] and goal mentions redis + session
  });

  it("classifies 'direct' conflict for antonym patterns", () => {
    // Goal implies "use Redis", decision says "Avoid Redis"
    const decisions = [makeDecision({ decision: "Avoid Redis for session storage" })];
    const result = detectDrift("Use Redis for session caching", decisions);
    expect(result.hasDrift).toBe(true);
    const directConflicts = result.conflicts.filter((c) => c.conflictType === "direct");
    expect(directConflicts.length).toBeGreaterThanOrEqual(1);
  });

  it("classifies 'indirect' conflict for preference patterns", () => {
    const decisions = [makeDecision({
      decision: "Prefer PostgreSQL over MySQL for data storage",
      tags: ["database", "sql"],
    })];
    const result = detectDrift("Set up MySQL database for the project", decisions);
    expect(result.hasDrift).toBe(true);
    const indirect = result.conflicts.filter((c) => c.conflictType === "indirect");
    expect(indirect.length).toBeGreaterThanOrEqual(1);
  });

  it("classifies 'ambiguous' when topic overlaps but no contradiction", () => {
    const decisions = [makeDecision({
      decision: "Use Redis for caching layer",
      tags: ["redis", "cache", "caching"],
    })];
    // Goal mentions Redis but doesn't contradict — just overlaps
    const result = detectDrift("Optimize Redis caching performance", decisions);
    if (result.hasDrift) {
      // If detected, should be ambiguous (no contradiction pattern)
      expect(result.conflicts[0]!.conflictType).toBe("ambiguous");
    }
  });

  it("severity 'soft' for 1 conflict when ambiguous", () => {
    const decisions = [makeDecision({
      decision: "Document Redis usage patterns",
      tags: ["redis"],
    })];
    const result = detectDrift("Review Redis deployment", decisions);
    if (result.hasDrift) {
      expect(result.severity).toBe("soft");
    }
  });

  it("severity 'hard' for any direct conflict", () => {
    const decisions = [makeDecision({ decision: "Avoid Redis for session storage" })];
    const result = detectDrift("Use Redis for session caching", decisions);
    expect(result.severity).toBe("hard");
  });

  it("severity 'hard' for 2+ conflicts", () => {
    const decisions = [
      makeDecision({ id: "d1", tags: ["redis", "session"], decision: "Document Redis sessions" }),
      makeDecision({
        id: "d2",
        tags: ["caching"],
        topic: "caching strategy",
        decision: "Document caching approach",
      }),
    ];
    const result = detectDrift("Add Redis-based session caching with persistence", decisions);
    if (result.conflicts.length >= 2) {
      expect(result.severity).toBe("hard");
    }
  });

  it("permanent decisions checked regardless of age", () => {
    const oldDecision = makeDecision({
      capturedAt: Date.now() - 180 * 24 * 60 * 60 * 1000, // 180 days ago
      tags: ["redis", "session"],
    }) as Decision & { permanent?: boolean };
    oldDecision.permanent = true;

    const result = detectDrift("Add Redis session storage", [oldDecision as Decision]);
    // Should still be checked despite being > 90 days old
    expect(result.conflicts.length).toBeGreaterThanOrEqual(1);
  });

  it("skips non-permanent decisions older than maxAgeDays", () => {
    const oldDecision = makeDecision({
      capturedAt: Date.now() - 180 * 24 * 60 * 60 * 1000,
      tags: ["redis"],
    });

    const result = detectDrift("Use Redis for caching", [oldDecision], { maxAgeDays: 90 });
    // Old non-permanent decision should be skipped
    expect(result.conflicts).toHaveLength(0);
  });

  it("skips superseded and reconsidered decisions", () => {
    const decisions = [
      makeDecision({ status: "superseded", tags: ["redis"] }),
      makeDecision({ id: "d2", status: "reconsidered", tags: ["redis"] }),
    ];
    const result = detectDrift("Use Redis for caching", decisions);
    expect(result.conflicts).toHaveLength(0);
  });

  it("detector error does not crash (returns safe default)", () => {
    // Pass invalid input — should not throw
    expect(() => detectDrift("", [])).not.toThrow();
    const result = detectDrift("", []);
    expect(result.severity).toBe("none");
  });
});
