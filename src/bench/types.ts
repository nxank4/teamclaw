/**
 * Benchmark types.
 */

export interface BenchmarkSuite {
  name: string;
  timestamp: string;
  platform: { os: string; arch: string; node: string; cpus: number; memoryGB: number };
  provider: string;
  results: BenchmarkResult[];
  summary: BenchmarkSummary;
}

export interface BenchmarkResult {
  scenario: string;
  metric: string;
  values: number[];
  stats: { min: number; max: number; mean: number; median: number; p95: number; stddev: number };
  target?: number;
  passed: boolean;
}

export interface BenchmarkSummary {
  totalScenarios: number;
  passed: number;
  failed: number;
  totalDuration: number;
}

export interface BenchmarkComparison {
  baseline: BenchmarkSuite;
  current: BenchmarkSuite;
  regressions: RegressionItem[];
  improvements: RegressionItem[];
  unchanged: string[];
}

export interface RegressionItem {
  scenario: string;
  metric: string;
  baselineValue: number;
  currentValue: number;
  changePercent: number;
  severity: "minor" | "significant" | "critical";
}
