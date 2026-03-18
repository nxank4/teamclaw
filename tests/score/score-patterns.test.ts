import { describe, it, expect } from "vitest";
import { calculateScore } from "@/score/calculator.js";
import { detectPatterns } from "@/score/patterns.js";
import type { ScoreInput } from "@/score/types.js";

function emptyInput(): ScoreInput {
  return {
    autoApprovedCount: 0,
    manualApprovedCount: 0,
    rejectedCount: 0,
    escalatedCount: 0,
    hardDriftProceedCount: 0,
    previousAutoRatio: null,
    skippedQaReviewCount: 0,
    rejectedNoFeedbackCount: 0,
    rejectedWithFeedbackCount: 0,
    forceApprovedAfterReworkCount: 0,
    ignoredHardDriftCount: 0,
    ignoredSoftDriftCount: 0,
    driftReconsideredCount: 0,
    clarityBlockingProceededCount: 0,
    clarityIssuesAnsweredCount: 0,
    ignoredBlockPushbackCount: 0,
    averageConfidence: 0,
    previousAverageConfidence: null,
    lowConfidenceApprovedCount: 0,
    escalatedForceProceedCount: 0,
  };
}

describe("detectPatterns", () => {
  it("fires override pattern at 3+ manual overrides", () => {
    const input = { ...emptyInput(), manualApprovedCount: 3 };
    const calc = calculateScore(input);
    const patterns = detectPatterns(calc, input);
    expect(patterns.some((p) => p.id === "override_heavy")).toBe(true);
  });

  it("does not fire override pattern below threshold", () => {
    const input = { ...emptyInput(), manualApprovedCount: 2 };
    const calc = calculateScore(input);
    const patterns = detectPatterns(calc, input);
    expect(patterns.some((p) => p.id === "override_heavy")).toBe(false);
  });

  it("fires ignored warnings pattern at 2+ ignored drifts", () => {
    const input = { ...emptyInput(), ignoredHardDriftCount: 1, ignoredSoftDriftCount: 1 };
    const calc = calculateScore(input);
    const patterns = detectPatterns(calc, input);
    expect(patterns.some((p) => p.id === "ignored_warnings")).toBe(true);
  });

  it("fires full acceptance pattern when no pushbacks ignored and high auto-approval", () => {
    const input = { ...emptyInput(), autoApprovedCount: 5, ignoredBlockPushbackCount: 0 };
    const calc = calculateScore(input);
    const patterns = detectPatterns(calc, input);
    expect(patterns.some((p) => p.id === "full_acceptance")).toBe(true);
  });

  it("returns no patterns for minimal activity", () => {
    const input = { ...emptyInput(), autoApprovedCount: 1 };
    const calc = calculateScore(input);
    const patterns = detectPatterns(calc, input);
    // Should not fire full_acceptance (need > 3 auto-approved)
    expect(patterns.filter((p) => p.id === "full_acceptance")).toHaveLength(0);
  });

  it("multiple patterns can fire simultaneously", () => {
    const input = {
      ...emptyInput(),
      manualApprovedCount: 5,
      ignoredHardDriftCount: 2,
      clarityBlockingProceededCount: 3,
    };
    const calc = calculateScore(input);
    const patterns = detectPatterns(calc, input);
    expect(patterns.some((p) => p.id === "override_heavy")).toBe(true);
    expect(patterns.some((p) => p.id === "ignored_warnings")).toBe(true);
    expect(patterns.some((p) => p.id === "clarity_skip")).toBe(true);
  });
});
