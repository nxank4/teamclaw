/**
 * Rule-based pattern detection from score calculation results.
 */

import type { ScoreCalculation, ScoreInput, BehaviorPattern } from "./types.js";

/**
 * Detect behavior patterns from score calculation and raw inputs.
 */
export function detectPatterns(
  calc: ScoreCalculation,
  input: ScoreInput,
): BehaviorPattern[] {
  const patterns: BehaviorPattern[] = [];

  // Override pattern: 3+ manual overrides
  if (input.manualApprovedCount >= 3) {
    const agentDetail = getTopOverrideAgent(input.overridesByAgent);
    const label = agentDetail
      ? `You override agents often (${input.manualApprovedCount} manual overrides, mostly ${agentDetail})`
      : `You override agents often (${input.manualApprovedCount} manual overrides)`;
    patterns.push({ id: "override_heavy", label, sentiment: "negative" });
  }

  // Ignored warnings
  const ignoredTotal = input.ignoredHardDriftCount + input.ignoredSoftDriftCount;
  if (ignoredTotal >= 2) {
    patterns.push({
      id: "ignored_warnings",
      label: `Drift warnings ignored ${ignoredTotal} times`,
      sentiment: "negative",
    });
  }

  // 100% acceptance (no pushbacks ignored)
  if (input.ignoredBlockPushbackCount === 0 && input.autoApprovedCount > 3) {
    patterns.push({
      id: "full_acceptance",
      label: "All agent pushbacks addressed — strong team trust",
      sentiment: "positive",
    });
  }

  // Clarity skip pattern
  if (input.clarityBlockingProceededCount >= 3) {
    patterns.push({
      id: "clarity_skip",
      label: `Blocking clarity issues skipped ${input.clarityBlockingProceededCount} times`,
      sentiment: "negative",
    });
  }

  // Feedback quality pattern
  if (input.rejectedWithFeedbackCount >= 2 && input.rejectedNoFeedbackCount === 0) {
    patterns.push({
      id: "quality_feedback",
      label: "All rejections include detailed feedback — agents learn faster",
      sentiment: "positive",
    });
  }

  // Review engagement low
  if (calc.dimensions.review_engagement.score < 10) {
    patterns.push({
      id: "low_review",
      label: "Low review engagement — consider reviewing agent outputs more carefully",
      sentiment: "negative",
    });
  }

  // Confidence alignment excellent
  if (calc.dimensions.confidence_alignment.score >= 23) {
    patterns.push({
      id: "high_confidence",
      label: "Team confidence consistently high",
      sentiment: "positive",
    });
  }

  return patterns;
}

function getTopOverrideAgent(overridesByAgent?: Record<string, number>): string | null {
  if (!overridesByAgent) return null;
  const entries = Object.entries(overridesByAgent);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0]![0];
}
