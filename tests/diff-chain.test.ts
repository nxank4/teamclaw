import { describe, it, expect } from "vitest";
import { buildDiffChain, buildPairDiff } from "../src/diff/chain.js";
import type { RunSnapshot } from "../src/diff/types.js";

function makeSnapshot(overrides: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    sessionId: "sess-1",
    runIndex: 1,
    tasks: [],
    averageConfidence: 0.7,
    totalCostUSD: 0.15,
    totalDurationMs: 120000,
    totalReworks: 3,
    autoApprovedCount: 2,
    team: ["coordinator", "worker_task"],
    patternsRetrieved: 0,
    newPatternsStored: 3,
    globalPromotions: 0,
    lessonsApplied: [],
    ...overrides,
  };
}

describe("buildDiffChain", () => {
  it("returns empty chain for single snapshot", () => {
    const chain = buildDiffChain([makeSnapshot()]);
    expect(chain.runDiffs).toHaveLength(0);
    expect(chain.totalRuns).toBe(1);
  });

  it("produces N-1 diffs for N snapshots", () => {
    const snapshots = [
      makeSnapshot({ runIndex: 1, averageConfidence: 0.7 }),
      makeSnapshot({ runIndex: 2, averageConfidence: 0.8 }),
      makeSnapshot({ runIndex: 3, averageConfidence: 0.9 }),
    ];
    const chain = buildDiffChain(snapshots);
    expect(chain.runDiffs).toHaveLength(2);
    expect(chain.totalRuns).toBe(3);
  });

  it("detects improving confidence trend", () => {
    const snapshots = [
      makeSnapshot({ runIndex: 1, averageConfidence: 0.6 }),
      makeSnapshot({ runIndex: 2, averageConfidence: 0.75 }),
      makeSnapshot({ runIndex: 3, averageConfidence: 0.9 }),
    ];
    const chain = buildDiffChain(snapshots);
    expect(chain.overallTrend.confidenceTrend).toBe("improving");
  });

  it("detects degrading confidence trend", () => {
    const snapshots = [
      makeSnapshot({ runIndex: 1, averageConfidence: 0.9 }),
      makeSnapshot({ runIndex: 2, averageConfidence: 0.8 }),
      makeSnapshot({ runIndex: 3, averageConfidence: 0.7 }),
    ];
    const chain = buildDiffChain(snapshots);
    expect(chain.overallTrend.confidenceTrend).toBe("degrading");
  });

  it("detects stable trend when changes are tiny", () => {
    const snapshots = [
      makeSnapshot({ runIndex: 1, averageConfidence: 0.85 }),
      makeSnapshot({ runIndex: 2, averageConfidence: 0.86 }),
      makeSnapshot({ runIndex: 3, averageConfidence: 0.86 }),
    ];
    const chain = buildDiffChain(snapshots);
    expect(chain.overallTrend.confidenceTrend).toBe("stable");
  });

  it("detects plateau when delta < 0.02 for last 2 consecutive diffs", () => {
    const snapshots = [
      makeSnapshot({ runIndex: 1, averageConfidence: 0.6 }),
      makeSnapshot({ runIndex: 2, averageConfidence: 0.8 }),
      makeSnapshot({ runIndex: 3, averageConfidence: 0.81 }),
      makeSnapshot({ runIndex: 4, averageConfidence: 0.815 }),
    ];
    const chain = buildDiffChain(snapshots);
    expect(chain.overallTrend.plateauDetected).toBe(true);
    expect(chain.overallTrend.plateauMessage).toContain("Plateau detected");
    expect(chain.overallTrend.plateauMessage).toContain("Consider:");
  });

  it("does not detect plateau when deltas are above threshold", () => {
    const snapshots = [
      makeSnapshot({ runIndex: 1, averageConfidence: 0.6 }),
      makeSnapshot({ runIndex: 2, averageConfidence: 0.7 }),
      makeSnapshot({ runIndex: 3, averageConfidence: 0.8 }),
    ];
    const chain = buildDiffChain(snapshots);
    expect(chain.overallTrend.plateauDetected).toBe(false);
  });

  it("computes learning efficiency", () => {
    const snapshots = [
      makeSnapshot({ runIndex: 1, averageConfidence: 0.6 }),
      makeSnapshot({ runIndex: 2, averageConfidence: 0.7 }),
      makeSnapshot({ runIndex: 3, averageConfidence: 0.8 }),
    ];
    const chain = buildDiffChain(snapshots);
    expect(chain.overallTrend.learningEfficiency).toBeCloseTo(0.1, 2);
  });

  it("detects improving cost trend (lower cost)", () => {
    const snapshots = [
      makeSnapshot({ runIndex: 1, totalCostUSD: 0.2 }),
      makeSnapshot({ runIndex: 2, totalCostUSD: 0.15 }),
      makeSnapshot({ runIndex: 3, totalCostUSD: 0.1 }),
    ];
    const chain = buildDiffChain(snapshots);
    expect(chain.overallTrend.costTrend).toBe("improving");
  });

  it("respects custom plateau threshold", () => {
    const snapshots = [
      makeSnapshot({ runIndex: 1, averageConfidence: 0.8 }),
      makeSnapshot({ runIndex: 2, averageConfidence: 0.84 }),
      makeSnapshot({ runIndex: 3, averageConfidence: 0.88 }),
    ];
    // With default threshold 0.02 — NOT a plateau (delta 0.04 > 0.02)
    const chain = buildDiffChain(snapshots);
    expect(chain.overallTrend.plateauDetected).toBe(false);

    // With higher threshold 0.05 — IS a plateau (delta 0.04 < 0.05)
    const chainHigh = buildDiffChain(snapshots, { plateauThreshold: 0.05 });
    expect(chainHigh.overallTrend.plateauDetected).toBe(true);
  });

  it("sorts snapshots by runIndex", () => {
    const snapshots = [
      makeSnapshot({ runIndex: 3, averageConfidence: 0.9 }),
      makeSnapshot({ runIndex: 1, averageConfidence: 0.7 }),
      makeSnapshot({ runIndex: 2, averageConfidence: 0.8 }),
    ];
    const chain = buildDiffChain(snapshots);
    expect(chain.runDiffs[0].fromRun).toBe(1);
    expect(chain.runDiffs[0].toRun).toBe(2);
    expect(chain.runDiffs[1].fromRun).toBe(2);
    expect(chain.runDiffs[1].toRun).toBe(3);
  });
});

describe("buildPairDiff", () => {
  it("produces a chain with exactly one diff", () => {
    const from = makeSnapshot({ runIndex: 1, averageConfidence: 0.7 });
    const to = makeSnapshot({ runIndex: 2, averageConfidence: 0.85 });
    const chain = buildPairDiff(from, to);
    expect(chain.runDiffs).toHaveLength(1);
    expect(chain.totalRuns).toBe(2);
    expect(chain.overallTrend.confidenceTrend).toBe("improving");
  });
});
