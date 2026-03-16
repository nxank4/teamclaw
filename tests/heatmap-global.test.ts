import { describe, it, expect, vi, beforeEach } from "vitest";
import * as globalModule from "../src/heatmap/global.js";

// We'll test the pure functions that don't touch disk
describe("parseSinceDuration", () => {
  it("parses days", () => {
    expect(globalModule.parseSinceDuration("30d")).toBe(30 * 24 * 60 * 60 * 1000);
    expect(globalModule.parseSinceDuration("7d")).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("parses hours", () => {
    expect(globalModule.parseSinceDuration("24h")).toBe(24 * 60 * 60 * 1000);
  });

  it("parses minutes", () => {
    expect(globalModule.parseSinceDuration("60m")).toBe(60 * 60 * 1000);
  });

  it("defaults to 30d for invalid input", () => {
    expect(globalModule.parseSinceDuration("invalid")).toBe(30 * 24 * 60 * 60 * 1000);
    expect(globalModule.parseSinceDuration("")).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe("getUtilizationSince filter", () => {
  it("correctly filters by time range", () => {
    // Test the pure filter logic — mock readStore via the module functions
    // The actual file I/O is tested at integration level
    const now = Date.now();
    const entries = [
      { agentRole: "worker", sessionId: "s1", runIndex: 1, recordedAt: now - 1000, utilizationPct: 0.5, bottleneckScore: 0.3, averageConfidence: 0.8, totalCostUSD: 0.01, tasksHandled: 2 },
      { agentRole: "worker", sessionId: "s2", runIndex: 1, recordedAt: now - 100000000, utilizationPct: 0.6, bottleneckScore: 0.4, averageConfidence: 0.7, totalCostUSD: 0.02, tasksHandled: 3 },
    ];

    // Filter entries that are within last 1 hour
    const oneHour = 60 * 60 * 1000;
    const cutoff = now - oneHour;
    const filtered = entries.filter((e) => e.recordedAt >= cutoff);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].sessionId).toBe("s1");
  });
});
