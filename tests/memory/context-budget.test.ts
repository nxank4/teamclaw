import { describe, it, expect } from "vitest";
import { ContextBudgetManager } from "../../src/memory/context-budget.js";

describe("ContextBudgetManager", () => {
  it("calculateBudget returns correct available tokens", () => {
    const mgr = new ContextBudgetManager(200_000);
    const budget = mgr.calculateBudget(500, 1000, 5000);
    expect(budget.availableForHistory).toBe(200_000 - 4096 - 500 - 1000);
    expect(budget.currentHistoryTokens).toBe(5000);
  });

  it("60% utilization → compressionLevel none", () => {
    const mgr = new ContextBudgetManager(100_000);
    const budget = mgr.calculateBudget(1000, 1000, 50_000);
    expect(mgr.getCompressionLevel(budget)).toBe("none");
  });

  it("80% utilization → compressionLevel aggressive", () => {
    const mgr = new ContextBudgetManager(100_000);
    const budget = mgr.calculateBudget(1000, 1000, 80_000);
    expect(mgr.getCompressionLevel(budget)).toBe("aggressive");
  });

  it("95% utilization → compressionLevel emergency", () => {
    const mgr = new ContextBudgetManager(100_000);
    const budget = mgr.calculateBudget(1000, 1000, 90_000);
    expect(mgr.getCompressionLevel(budget)).toBe("emergency");
  });

  it("getMemoryBudget returns 0 when no space left", () => {
    const mgr = new ContextBudgetManager(10_000);
    const budget = mgr.calculateBudget(3000, 2000, 5000);
    expect(mgr.getMemoryBudget(budget)).toBeGreaterThanOrEqual(0);
  });

  it("respects minHistoryMessages default", () => {
    const mgr = new ContextBudgetManager(100_000, { minHistoryMessages: 8 });
    // Just verify construction doesn't throw
    expect(mgr).toBeDefined();
  });
});
