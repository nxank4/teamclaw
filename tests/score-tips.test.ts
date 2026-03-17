import { describe, it, expect } from "vitest";
import { calculateScore } from "../src/score/calculator.js";
import { selectTip } from "../src/score/tips.js";
import type { ScoreInput } from "../src/score/types.js";

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

describe("selectTip", () => {
  it("selects tip for lowest dimension", () => {
    // Team trust and confidence will be 0 (lowest), review and warning at 25
    const input = emptyInput();
    const calc = calculateScore(input);
    const tip = selectTip(calc, input);
    expect(typeof tip).toBe("string");
    expect(tip.length).toBeGreaterThan(0);
  });

  it("fills template placeholders with real data", () => {
    const input = { ...emptyInput(), manualApprovedCount: 5 };
    const calc = calculateScore(input);
    const tip = selectTip(calc, input);
    // Should contain the count
    expect(tip).toContain("5");
  });

  it("produces a tip even with zero-score dimensions", () => {
    const input = emptyInput();
    const calc = calculateScore(input);
    const tip = selectTip(calc, input);
    expect(tip).toBeTruthy();
  });

  it("produces different tips for different lowest dimensions", () => {
    // Make warning_response the lowest
    const input1 = {
      ...emptyInput(),
      autoApprovedCount: 10,
      averageConfidence: 1.0,
      ignoredHardDriftCount: 5,
      ignoredSoftDriftCount: 5,
    };
    const calc1 = calculateScore(input1);
    const tip1 = selectTip(calc1, input1);

    // Make confidence the lowest
    const input2 = {
      ...emptyInput(),
      autoApprovedCount: 10,
      averageConfidence: 0.1,
      lowConfidenceApprovedCount: 5,
    };
    const calc2 = calculateScore(input2);
    const tip2 = selectTip(calc2, input2);

    expect(tip1).not.toBe(tip2);
  });
});
