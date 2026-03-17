/**
 * Dimension formulas for vibe coding score.
 * Each dimension returns a score clamped to [0, 25].
 */

import type { ScoreInput, DimensionResult, ScoringEvent } from "./types.js";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function calculateTeamTrust(input: ScoreInput): DimensionResult {
  const events: ScoringEvent[] = [];
  const total = input.autoApprovedCount + input.manualApprovedCount + input.rejectedCount + input.escalatedCount;
  const base = total > 0 ? (input.autoApprovedCount / total) * 25 : 0;

  let bonuses = 0;
  let penalties = 0;

  // +2 if auto-approval ratio increased from previous day
  if (input.previousAutoRatio !== null && total > 0) {
    const currentRatio = input.autoApprovedCount / total;
    if (currentRatio > input.previousAutoRatio) {
      bonuses += 2;
      events.push({ dimension: "team_trust", type: "bonus", label: "Auto-approval ratio increased", points: 2 });
    }
  }

  // -3 per manual override
  if (input.manualApprovedCount > 0) {
    const pen = input.manualApprovedCount * 3;
    penalties += pen;
    events.push({ dimension: "team_trust", type: "penalty", label: `${input.manualApprovedCount} manual override(s)`, points: pen });
  }

  // -5 per hard drift proceed
  if (input.hardDriftProceedCount > 0) {
    const pen = input.hardDriftProceedCount * 5;
    penalties += pen;
    events.push({ dimension: "team_trust", type: "penalty", label: `${input.hardDriftProceedCount} hard drift proceed(s)`, points: pen });
  }

  const score = clamp(base + bonuses - penalties, 0, 25);
  return {
    score,
    base: Math.round(base * 100) / 100,
    bonuses,
    penalties,
    detail: `${input.autoApprovedCount}/${total} auto-approved`,
    events,
  };
}

export function calculateReviewEngagement(input: ScoreInput): DimensionResult {
  const events: ScoringEvent[] = [];
  const base = 25;

  let bonuses = 0;
  let penalties = 0;

  // -4 per skipped QA review
  if (input.skippedQaReviewCount > 0) {
    const pen = input.skippedQaReviewCount * 4;
    penalties += pen;
    events.push({ dimension: "review_engagement", type: "penalty", label: `${input.skippedQaReviewCount} skipped QA review(s)`, points: pen });
  }

  // -3 per rejected without feedback
  if (input.rejectedNoFeedbackCount > 0) {
    const pen = input.rejectedNoFeedbackCount * 3;
    penalties += pen;
    events.push({ dimension: "review_engagement", type: "penalty", label: `${input.rejectedNoFeedbackCount} rejection(s) without feedback`, points: pen });
  }

  // +2 per rejected with feedback
  if (input.rejectedWithFeedbackCount > 0) {
    const bon = input.rejectedWithFeedbackCount * 2;
    bonuses += bon;
    events.push({ dimension: "review_engagement", type: "bonus", label: `${input.rejectedWithFeedbackCount} rejection(s) with feedback`, points: bon });
  }

  // -5 per force-approved after rework
  if (input.forceApprovedAfterReworkCount > 0) {
    const pen = input.forceApprovedAfterReworkCount * 5;
    penalties += pen;
    events.push({ dimension: "review_engagement", type: "penalty", label: `${input.forceApprovedAfterReworkCount} force-approved after rework`, points: pen });
  }

  const score = clamp(base + bonuses - penalties, 0, 25);
  return {
    score,
    base,
    bonuses,
    penalties,
    detail: `Base 25, ${bonuses > 0 ? `+${bonuses}` : ""}${penalties > 0 ? ` -${penalties}` : ""}`,
    events,
  };
}

export function calculateWarningResponse(input: ScoreInput): DimensionResult {
  const events: ScoringEvent[] = [];
  const base = 25;

  let bonuses = 0;
  let penalties = 0;

  // -5 per ignored hard drift
  if (input.ignoredHardDriftCount > 0) {
    const pen = input.ignoredHardDriftCount * 5;
    penalties += pen;
    events.push({ dimension: "warning_response", type: "penalty", label: `${input.ignoredHardDriftCount} ignored hard drift(s)`, points: pen });
  }

  // -3 per ignored soft drift
  if (input.ignoredSoftDriftCount > 0) {
    const pen = input.ignoredSoftDriftCount * 3;
    penalties += pen;
    events.push({ dimension: "warning_response", type: "penalty", label: `${input.ignoredSoftDriftCount} ignored soft drift(s)`, points: pen });
  }

  // -2 per clarity blocking proceeded
  if (input.clarityBlockingProceededCount > 0) {
    const pen = input.clarityBlockingProceededCount * 2;
    penalties += pen;
    events.push({ dimension: "warning_response", type: "penalty", label: `${input.clarityBlockingProceededCount} clarity warning(s) ignored`, points: pen });
  }

  // -3 per ignored block pushback
  if (input.ignoredBlockPushbackCount > 0) {
    const pen = input.ignoredBlockPushbackCount * 3;
    penalties += pen;
    events.push({ dimension: "warning_response", type: "penalty", label: `${input.ignoredBlockPushbackCount} block pushback(s) ignored`, points: pen });
  }

  // +3 per drift reconsidered
  if (input.driftReconsideredCount > 0) {
    const bon = input.driftReconsideredCount * 3;
    bonuses += bon;
    events.push({ dimension: "warning_response", type: "bonus", label: `${input.driftReconsideredCount} drift(s) reconsidered`, points: bon });
  }

  // +2 per clarity issue answered
  if (input.clarityIssuesAnsweredCount > 0) {
    const bon = input.clarityIssuesAnsweredCount * 2;
    bonuses += bon;
    events.push({ dimension: "warning_response", type: "bonus", label: `${input.clarityIssuesAnsweredCount} clarity issue(s) answered`, points: bon });
  }

  const score = clamp(base + bonuses - penalties, 0, 25);
  return {
    score,
    base,
    bonuses,
    penalties,
    detail: `Base 25, ${bonuses > 0 ? `+${bonuses}` : ""}${penalties > 0 ? ` -${penalties}` : ""}`,
    events,
  };
}

export function calculateConfidenceAlignment(input: ScoreInput): DimensionResult {
  const events: ScoringEvent[] = [];
  const base = (input.averageConfidence / 1.0) * 25;

  let bonuses = 0;
  let penalties = 0;

  // +3 if average confidence increased
  if (input.previousAverageConfidence !== null && input.averageConfidence > input.previousAverageConfidence) {
    bonuses += 3;
    events.push({ dimension: "confidence_alignment", type: "bonus", label: "Average confidence increased", points: 3 });
  }

  // -2 per low-confidence approved
  if (input.lowConfidenceApprovedCount > 0) {
    const pen = input.lowConfidenceApprovedCount * 2;
    penalties += pen;
    events.push({ dimension: "confidence_alignment", type: "penalty", label: `${input.lowConfidenceApprovedCount} low-confidence task(s) approved`, points: pen });
  }

  // -4 per escalated force-proceed
  if (input.escalatedForceProceedCount > 0) {
    const pen = input.escalatedForceProceedCount * 4;
    penalties += pen;
    events.push({ dimension: "confidence_alignment", type: "penalty", label: `${input.escalatedForceProceedCount} escalated force-proceed(s)`, points: pen });
  }

  const score = clamp(base + bonuses - penalties, 0, 25);
  return {
    score,
    base: Math.round(base * 100) / 100,
    bonuses,
    penalties,
    detail: `Avg confidence ${(input.averageConfidence * 100).toFixed(0)}%`,
    events,
  };
}
