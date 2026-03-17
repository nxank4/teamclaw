import { describe, it, expect } from "vitest";
import { deriveCurrentState } from "../src/handoff/state-deriver.js";

describe("deriveCurrentState", () => {
  it('converts "Implement X" to "X implemented"', () => {
    const result = deriveCurrentState([
      { description: "Implement auth module", confidence: 0.9 },
    ]);
    expect(result).toEqual(["auth module implemented"]);
  });

  it('converts "Add X" to "X added"', () => {
    const result = deriveCurrentState([
      { description: "Add logging middleware", confidence: 0.8 },
    ]);
    expect(result).toEqual(["logging middleware added"]);
  });

  it('converts "Write X" to "X written"', () => {
    const result = deriveCurrentState([
      { description: "Write integration tests", confidence: 0.85 },
    ]);
    expect(result).toEqual(["integration tests written"]);
  });

  it('converts "Fix X" to "X fixed"', () => {
    const result = deriveCurrentState([
      { description: "Fix memory leak in worker", confidence: 0.95 },
    ]);
    expect(result).toEqual(["memory leak in worker fixed"]);
  });

  it('converts "Refactor X" to "X refactored"', () => {
    const result = deriveCurrentState([
      { description: "Refactor database layer", confidence: 0.7 },
    ]);
    expect(result).toEqual(["database layer refactored"]);
  });

  it("handles unknown verbs gracefully", () => {
    const result = deriveCurrentState([
      { description: "Optimize query performance", confidence: 0.8 },
    ]);
    expect(result).toEqual(["Optimize query performance — completed"]);
  });

  it("limits output to 5 bullets", () => {
    const tasks = Array.from({ length: 8 }, (_, i) => ({
      description: `Fix bug ${i + 1}`,
      confidence: 0.5 + i * 0.05,
    }));
    const result = deriveCurrentState(tasks);
    expect(result).toHaveLength(5);
  });

  it("picks highest confidence tasks when limiting", () => {
    const tasks = [
      { description: "Fix bug A", confidence: 0.3 },
      { description: "Fix bug B", confidence: 0.9 },
      { description: "Fix bug C", confidence: 0.1 },
      { description: "Fix bug D", confidence: 0.8 },
      { description: "Fix bug E", confidence: 0.5 },
      { description: "Fix bug F", confidence: 0.7 },
    ];
    const result = deriveCurrentState(tasks);
    expect(result).toHaveLength(5);
    expect(result[0]).toBe("bug B fixed");
    expect(result[1]).toBe("bug D fixed");
  });

  it("returns empty array for empty input", () => {
    const result = deriveCurrentState([]);
    expect(result).toEqual([]);
  });

  it("handles leading/trailing whitespace", () => {
    const result = deriveCurrentState([
      { description: "  Add caching layer  ", confidence: 0.8 },
    ]);
    expect(result).toEqual(["caching layer added"]);
  });
});
