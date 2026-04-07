/**
 * Assessor — runs tests and metrics to evaluate a change.
 */

import { execFileSync } from "node:child_process";
import { measureMetric } from "./metric.js";
import type { AssessConfig, MetricConfig } from "./types.js";

export interface AssessmentResult {
  testsPassed: boolean;
  lintPassed: boolean;
  typecheckPassed: boolean;
  metricValue: number;
  error?: string;
}

export function assess(
  metricConfig: MetricConfig,
  assessConfig: AssessConfig,
): AssessmentResult {
  let testsPassed = true;
  let lintPassed = true;
  let typecheckPassed = true;
  let error: string | undefined;

  // Run typecheck
  if (assessConfig.typecheck) {
    try {
      runShellCommand(assessConfig.typecheck);
    } catch (err) {
      typecheckPassed = false;
      error = `Typecheck failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // Run lint
  if (assessConfig.lint && typecheckPassed) {
    try {
      runShellCommand(assessConfig.lint);
    } catch (err) {
      lintPassed = false;
      error = `Lint failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // Run tests
  if (assessConfig.tests && typecheckPassed && lintPassed) {
    try {
      runShellCommand(assessConfig.tests);
    } catch (err) {
      testsPassed = false;
      error = `Tests failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // Measure metric
  let metricValue = 0;
  try {
    metricValue = measureMetric(metricConfig);
  } catch (err) {
    error = `Metric measurement failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  return { testsPassed, lintPassed, typecheckPassed, metricValue, error };
}

function runShellCommand(command: string): void {
  const parts = command.split(/\s+/);
  const cmd = parts[0]!;
  const args = parts.slice(1);
  execFileSync(cmd, args, {
    encoding: "utf-8",
    timeout: 120_000,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
