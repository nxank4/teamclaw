import { describe, it, expect } from "vitest";
import { calculateTrend } from "@/score/trends.js";
import type { VibeScoreEntry } from "@/score/types.js";

function makeEntry(date: string, overall: number): VibeScoreEntry {
  return {
    id: `score-${date}`,
    date,
    overall,
    teamTrust: overall / 4,
    reviewEngagement: overall / 4,
    warningResponse: overall / 4,
    confidenceAlignment: overall / 4,
    sessionCount: 1,
    eventsJson: "[]",
    patternsJson: "[]",
    tip: "",
    computedAt: Date.now(),
  };
}

describe("calculateTrend", () => {
  it("returns null delta with empty scores", () => {
    const trend = calculateTrend([]);
    expect(trend.current).toBe(0);
    expect(trend.delta).toBeNull();
    expect(trend.direction).toBe("stable");
  });

  it("returns null delta with single entry", () => {
    const trend = calculateTrend([makeEntry("2026-03-17", 75)]);
    expect(trend.current).toBe(75);
    expect(trend.delta).toBeNull();
    expect(trend.direction).toBe("stable");
  });

  it("detects improving trend (delta > 5)", () => {
    const scores = [
      makeEntry("2026-03-17", 80),
      makeEntry("2026-03-10", 60),
    ];
    const trend = calculateTrend(scores);
    expect(trend.current).toBe(80);
    expect(trend.lastWeek).toBe(60);
    expect(trend.delta).toBe(20);
    expect(trend.direction).toBe("improving");
  });

  it("detects degrading trend (delta < -5)", () => {
    const scores = [
      makeEntry("2026-03-17", 40),
      makeEntry("2026-03-10", 70),
    ];
    const trend = calculateTrend(scores);
    expect(trend.delta).toBe(-30);
    expect(trend.direction).toBe("degrading");
  });

  it("detects plateaued when delta < 2 for 2+ weeks", () => {
    const scores = [
      makeEntry("2026-03-17", 65),
      makeEntry("2026-03-10", 64),
      makeEntry("2026-03-03", 65),
    ];
    const trend = calculateTrend(scores);
    expect(trend.direction).toBe("plateaued");
  });

  it("returns history sorted by date descending", () => {
    const scores = [
      makeEntry("2026-03-10", 60),
      makeEntry("2026-03-17", 80),
      makeEntry("2026-03-03", 50),
    ];
    const trend = calculateTrend(scores);
    expect(trend.history[0]!.date).toBe("2026-03-17");
    expect(trend.history[1]!.date).toBe("2026-03-10");
    expect(trend.history[2]!.date).toBe("2026-03-03");
  });
});
