import { describe, it, expect } from "vitest";
import { BenchmarkComparator } from "../../src/bench/comparator.js";
import type { BenchmarkSuite } from "../../src/bench/types.js";

function makeSuite(results: Array<{ scenario: string; mean: number }>): BenchmarkSuite {
  return {
    name: "test",
    timestamp: new Date().toISOString(),
    platform: { os: "linux", arch: "x64", node: "22.0.0", cpus: 8, memoryGB: 16 },
    provider: "mock",
    results: results.map((r) => ({
      scenario: r.scenario,
      metric: "duration_ms",
      values: [r.mean],
      stats: { min: r.mean, max: r.mean, mean: r.mean, median: r.mean, p95: r.mean, stddev: 0 },
      passed: true,
    })),
    summary: { totalScenarios: results.length, passed: results.length, failed: 0, totalDuration: 1000 },
  };
}

describe("BenchmarkComparator", () => {
  const comparator = new BenchmarkComparator();

  it("detects minor regression (5-15%)", () => {
    const baseline = makeSuite([{ scenario: "startup", mean: 100 }]);
    const current = makeSuite([{ scenario: "startup", mean: 110 }]);
    const result = comparator.compare(baseline, current);
    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0]!.severity).toBe("minor");
  });

  it("detects significant regression (15-30%)", () => {
    const baseline = makeSuite([{ scenario: "startup", mean: 100 }]);
    const current = makeSuite([{ scenario: "startup", mean: 125 }]);
    const result = comparator.compare(baseline, current);
    expect(result.regressions[0]!.severity).toBe("significant");
  });

  it("detects improvement (negative change)", () => {
    const baseline = makeSuite([{ scenario: "ttft", mean: 100 }]);
    const current = makeSuite([{ scenario: "ttft", mean: 80 }]);
    const result = comparator.compare(baseline, current);
    expect(result.improvements).toHaveLength(1);
  });

  it("unchanged for < 5% change", () => {
    const baseline = makeSuite([{ scenario: "memory", mean: 100 }]);
    const current = makeSuite([{ scenario: "memory", mean: 103 }]);
    const result = comparator.compare(baseline, current);
    expect(result.unchanged).toContain("memory");
  });
});
