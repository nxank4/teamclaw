import { describe, it, expect } from "vitest";
import { calculateScore } from "../src/score/calculator.js";
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

describe("calculateScore", () => {
  it("returns 50 for zero-session input (review + warning base)", () => {
    const result = calculateScore(emptyInput());
    // team_trust: 0/0 = 0, review: base 25, warning: base 25, confidence: 0*25 = 0
    expect(result.overall).toBe(50);
    expect(result.dimensions.team_trust.score).toBe(0);
    expect(result.dimensions.review_engagement.score).toBe(25);
    expect(result.dimensions.warning_response.score).toBe(25);
    expect(result.dimensions.confidence_alignment.score).toBe(0);
    expect(result.events).toHaveLength(0);
  });

  it("is idempotent — same input gives same output", () => {
    const input = { ...emptyInput(), autoApprovedCount: 5, averageConfidence: 0.8 };
    const a = calculateScore(input);
    const b = calculateScore(input);
    expect(a.overall).toBe(b.overall);
    expect(a.dimensions.team_trust.score).toBe(b.dimensions.team_trust.score);
  });

  it("overall is capped at 100", () => {
    const input = {
      ...emptyInput(),
      autoApprovedCount: 100,
      averageConfidence: 1.0,
      previousAutoRatio: 0.5,
      previousAverageConfidence: 0.5,
      driftReconsideredCount: 10,
      clarityIssuesAnsweredCount: 10,
      rejectedWithFeedbackCount: 10,
    };
    const result = calculateScore(input);
    expect(result.overall).toBeLessThanOrEqual(100);
  });

  it("overall is never negative", () => {
    const input = {
      ...emptyInput(),
      manualApprovedCount: 20,
      hardDriftProceedCount: 10,
      skippedQaReviewCount: 10,
      ignoredHardDriftCount: 10,
      lowConfidenceApprovedCount: 10,
      escalatedForceProceedCount: 10,
    };
    const result = calculateScore(input);
    expect(result.overall).toBeGreaterThanOrEqual(0);
  });
});

describe("team trust dimension", () => {
  it("calculates base from auto-approval ratio minus penalties", () => {
    const input = { ...emptyInput(), autoApprovedCount: 8, manualApprovedCount: 2 };
    const result = calculateScore(input);
    // base: 8/10 * 25 = 20, penalty: 2 manual * 3 = 6 → 20 - 6 = 14
    expect(result.dimensions.team_trust.score).toBe(14);
  });

  it("applies +2 bonus when auto ratio increases", () => {
    const input = { ...emptyInput(), autoApprovedCount: 8, manualApprovedCount: 2, previousAutoRatio: 0.5 };
    const result = calculateScore(input);
    // base: 20, +2 bonus, -6 manual penalty = 16
    expect(result.dimensions.team_trust.score).toBe(16);
  });

  it("applies -3 penalty per manual override", () => {
    const input = { ...emptyInput(), autoApprovedCount: 8, manualApprovedCount: 2 };
    const result = calculateScore(input);
    expect(result.dimensions.team_trust.penalties).toBe(6); // 2 * 3
  });

  it("applies -5 penalty per hard drift proceed", () => {
    const input = { ...emptyInput(), autoApprovedCount: 10, hardDriftProceedCount: 2 };
    const result = calculateScore(input);
    expect(result.dimensions.team_trust.penalties).toBe(10); // 2 * 5
  });

  it("dimension capped at 25", () => {
    const input = {
      ...emptyInput(),
      autoApprovedCount: 100,
      previousAutoRatio: 0.5,
    };
    const result = calculateScore(input);
    expect(result.dimensions.team_trust.score).toBeLessThanOrEqual(25);
  });

  it("dimension does not go below 0", () => {
    const input = {
      ...emptyInput(),
      manualApprovedCount: 20,
      hardDriftProceedCount: 10,
    };
    const result = calculateScore(input);
    expect(result.dimensions.team_trust.score).toBeGreaterThanOrEqual(0);
  });
});

describe("review engagement dimension", () => {
  it("starts at base 25", () => {
    const result = calculateScore(emptyInput());
    expect(result.dimensions.review_engagement.score).toBe(25);
  });

  it("applies -4 per skipped QA review", () => {
    const input = { ...emptyInput(), skippedQaReviewCount: 2 };
    const result = calculateScore(input);
    expect(result.dimensions.review_engagement.score).toBe(17); // 25 - 8
  });

  it("applies -3 per rejected without feedback", () => {
    const input = { ...emptyInput(), rejectedNoFeedbackCount: 3 };
    const result = calculateScore(input);
    expect(result.dimensions.review_engagement.score).toBe(16); // 25 - 9
  });

  it("applies +2 per rejected with feedback", () => {
    const input = { ...emptyInput(), rejectedWithFeedbackCount: 2 };
    const result = calculateScore(input);
    // 25 + 4 = 29, capped at 25
    expect(result.dimensions.review_engagement.score).toBe(25);
  });

  it("applies -5 per force-approved after rework", () => {
    const input = { ...emptyInput(), forceApprovedAfterReworkCount: 1 };
    const result = calculateScore(input);
    expect(result.dimensions.review_engagement.score).toBe(20);
  });
});

describe("warning response dimension", () => {
  it("starts at base 25", () => {
    const result = calculateScore(emptyInput());
    expect(result.dimensions.warning_response.score).toBe(25);
  });

  it("applies -5 per ignored hard drift", () => {
    const input = { ...emptyInput(), ignoredHardDriftCount: 2 };
    const result = calculateScore(input);
    expect(result.dimensions.warning_response.score).toBe(15);
  });

  it("applies +3 per drift reconsidered", () => {
    const input = { ...emptyInput(), driftReconsideredCount: 1, ignoredHardDriftCount: 1 };
    const result = calculateScore(input);
    // 25 - 5 + 3 = 23
    expect(result.dimensions.warning_response.score).toBe(23);
  });

  it("applies +2 per clarity issue answered", () => {
    const input = { ...emptyInput(), clarityIssuesAnsweredCount: 2 };
    const result = calculateScore(input);
    // 25 + 4 = 29, capped at 25
    expect(result.dimensions.warning_response.score).toBe(25);
  });
});

describe("confidence alignment dimension", () => {
  it("scales from average confidence", () => {
    const input = { ...emptyInput(), averageConfidence: 0.8 };
    const result = calculateScore(input);
    // 0.8 * 25 = 20
    expect(result.dimensions.confidence_alignment.score).toBe(20);
  });

  it("applies +3 bonus when confidence increases", () => {
    const input = { ...emptyInput(), averageConfidence: 0.8, previousAverageConfidence: 0.6 };
    const result = calculateScore(input);
    // 20 + 3 = 23
    expect(result.dimensions.confidence_alignment.score).toBe(23);
  });

  it("applies -2 per low-confidence approved", () => {
    const input = { ...emptyInput(), averageConfidence: 1.0, lowConfidenceApprovedCount: 3 };
    const result = calculateScore(input);
    // 25 - 6 = 19
    expect(result.dimensions.confidence_alignment.score).toBe(19);
  });

  it("applies -4 per escalated force-proceed", () => {
    const input = { ...emptyInput(), averageConfidence: 1.0, escalatedForceProceedCount: 2 };
    const result = calculateScore(input);
    // 25 - 8 = 17
    expect(result.dimensions.confidence_alignment.score).toBe(17);
  });
});
