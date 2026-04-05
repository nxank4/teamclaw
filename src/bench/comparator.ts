/**
 * Compare benchmark runs for regressions.
 */

import type { BenchmarkSuite, BenchmarkComparison, RegressionItem } from "./types.js";

export class BenchmarkComparator {
  compare(baseline: BenchmarkSuite, current: BenchmarkSuite): BenchmarkComparison {
    const regressions: RegressionItem[] = [];
    const improvements: RegressionItem[] = [];
    const unchanged: string[] = [];

    for (const currentResult of current.results) {
      const baseResult = baseline.results.find(
        (r) => r.scenario === currentResult.scenario && r.metric === currentResult.metric,
      );
      if (!baseResult) continue;

      const baseVal = baseResult.stats.mean;
      const currVal = currentResult.stats.mean;
      if (baseVal === 0) continue;

      const changePct = ((currVal - baseVal) / baseVal) * 100;

      if (Math.abs(changePct) < 5) {
        unchanged.push(currentResult.scenario);
      } else if (changePct > 0) {
        // Slower/bigger = regression
        regressions.push({
          scenario: currentResult.scenario,
          metric: currentResult.metric,
          baselineValue: baseVal,
          currentValue: currVal,
          changePercent: changePct,
          severity: changePct > 30 ? "critical" : changePct > 15 ? "significant" : "minor",
        });
      } else {
        improvements.push({
          scenario: currentResult.scenario,
          metric: currentResult.metric,
          baselineValue: baseVal,
          currentValue: currVal,
          changePercent: changePct,
          severity: "minor",
        });
      }
    }

    return { baseline, current, regressions, improvements, unchanged };
  }
}
