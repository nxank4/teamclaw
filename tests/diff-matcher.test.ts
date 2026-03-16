import { describe, it, expect } from "vitest";
import { matchTasks, tokenize, cosineSimilarity } from "../src/diff/matcher.js";
import type { TaskSnapshot } from "../src/diff/types.js";

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

describe("matchTasks", () => {
  it("matches tasks by exact taskId", () => {
    const from = [makeTask({ taskId: "t-1", description: "Build auth" })];
    const to = [makeTask({ taskId: "t-1", description: "Build auth module" })];

    const result = matchTasks(from, to);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].matchType).toBe("exact");
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it("fuzzy-matches renamed tasks at similarity >= 0.8", () => {
    const from = [makeTask({ taskId: "t-1", description: "Implement OAuth2 authentication flow" })];
    const to = [makeTask({ taskId: "t-99", description: "Implement OAuth2 authentication flow with refresh" })];

    const result = matchTasks(from, to);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].matchType).toBe("fuzzy");
  });

  it("identifies added tasks with no match", () => {
    const from = [makeTask({ taskId: "t-1", description: "Build auth" })];
    const to = [
      makeTask({ taskId: "t-1", description: "Build auth" }),
      makeTask({ taskId: "t-2", description: "Write database migration scripts" }),
    ];

    const result = matchTasks(from, to);
    expect(result.matched).toHaveLength(1);
    expect(result.added).toHaveLength(1);
    expect(result.added[0].taskId).toBe("t-2");
  });

  it("identifies removed tasks with no match", () => {
    const from = [
      makeTask({ taskId: "t-1", description: "Build auth" }),
      makeTask({ taskId: "t-2", description: "Write tests for payment gateway" }),
    ];
    const to = [makeTask({ taskId: "t-1", description: "Build auth" })];

    const result = matchTasks(from, to);
    expect(result.matched).toHaveLength(1);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0].taskId).toBe("t-2");
  });

  it("does not fuzzy-match dissimilar tasks", () => {
    const from = [makeTask({ taskId: "t-1", description: "Build authentication module" })];
    const to = [makeTask({ taskId: "t-99", description: "Deploy kubernetes cluster" })];

    const result = matchTasks(from, to);
    expect(result.matched).toHaveLength(0);
    expect(result.added).toHaveLength(1);
    expect(result.removed).toHaveLength(1);
  });

  it("handles empty task lists", () => {
    const result = matchTasks([], []);
    expect(result.matched).toHaveLength(0);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });
});

describe("tokenize", () => {
  it("lowercases and splits into words", () => {
    const tokens = tokenize("Build OAuth2 Flow");
    expect(tokens).toContain("build");
    expect(tokens).toContain("oauth2");
    expect(tokens).toContain("flow");
  });

  it("filters out stop words", () => {
    const tokens = tokenize("the quick and the lazy");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("and");
    expect(tokens).toContain("quick");
    expect(tokens).toContain("lazy");
  });

  it("filters out single-char tokens", () => {
    const tokens = tokenize("a b c de fg");
    expect(tokens).not.toContain("a");
    expect(tokens).not.toContain("b");
    expect(tokens).toContain("de");
    expect(tokens).toContain("fg");
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical token sets", () => {
    const tokens = ["build", "auth", "module"];
    expect(cosineSimilarity(tokens, tokens)).toBeCloseTo(1.0);
  });

  it("returns 0 for completely different sets", () => {
    const a = ["build", "auth"];
    const b = ["deploy", "kubernetes"];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("returns 0 for empty inputs", () => {
    expect(cosineSimilarity([], ["hello"])).toBe(0);
    expect(cosineSimilarity(["hello"], [])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns high similarity for overlapping sets", () => {
    const a = ["implement", "oauth2", "authentication", "flow"];
    const b = ["implement", "oauth2", "authentication", "flow", "refresh"];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0.8);
  });
});
