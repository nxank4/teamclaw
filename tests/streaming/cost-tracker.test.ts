import { describe, it, expect, vi } from "vitest";
import { CostTracker, calculateCost } from "../../src/streaming/cost-tracker.js";

describe("CostTracker", () => {
  it("records usage and calculates cost", () => {
    const tracker = new CostTracker();
    tracker.recordUsage("s1", "coder", "anthropic", "claude-sonnet-4-6", 1000, 500);

    const cost = tracker.getSessionCost("s1");
    expect(cost.totalInputTokens).toBe(1000);
    expect(cost.totalOutputTokens).toBe(500);
    expect(cost.totalCostUSD).toBeGreaterThan(0);
  });

  it("aggregates across multiple agents", () => {
    const tracker = new CostTracker();
    tracker.recordUsage("s1", "coder", "anthropic", "claude-sonnet-4-6", 1000, 500);
    tracker.recordUsage("s1", "reviewer", "anthropic", "claude-sonnet-4-6", 800, 200);

    const cost = tracker.getSessionCost("s1");
    expect(cost.totalInputTokens).toBe(1800);
    expect(cost.totalOutputTokens).toBe(700);
    expect(cost.byAgent.coder).toBeDefined();
    expect(cost.byAgent.reviewer).toBeDefined();
  });

  it("handles unknown model with fallback pricing", () => {
    const cost = calculateCost("unknown-model-xyz", 1000, 500);
    expect(cost).toBeGreaterThan(0); // Should use fallback, not NaN
  });

  it("emits CostUpdateEvent on each record", () => {
    const tracker = new CostTracker();
    const events: unknown[] = [];
    tracker.on("cost:update", (e) => events.push(e));

    tracker.recordUsage("s1", "coder", "anthropic", "default", 100, 50);
    expect(events).toHaveLength(1);
  });

  it("getSessionCost returns correct breakdown", () => {
    const tracker = new CostTracker();
    tracker.recordUsage("s1", "coder", "anthropic", "claude-sonnet-4-6", 1000, 500);
    tracker.recordUsage("s1", "coder", "openai", "gpt-4o", 500, 200);

    const cost = tracker.getSessionCost("s1");
    expect(cost.byProvider.anthropic).toBeDefined();
    expect(cost.byProvider.openai).toBeDefined();
    expect(cost.byProvider.anthropic!.tokens).toBe(1500);
    expect(cost.byProvider.openai!.tokens).toBe(700);
  });

  it("resetSession clears all data", () => {
    const tracker = new CostTracker();
    tracker.recordUsage("s1", "coder", "anthropic", "default", 1000, 500);
    tracker.resetSession("s1");

    const cost = tracker.getSessionCost("s1");
    expect(cost.totalInputTokens).toBe(0);
    expect(cost.totalCostUSD).toBe(0);
  });
});
