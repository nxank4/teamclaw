/**
 * Score calculator — orchestrates dimension calculations and builds ScoreInput from GraphState.
 */

import type { ScoreInput, ScoreCalculation } from "./types.js";
import {
  calculateTeamTrust,
  calculateReviewEngagement,
  calculateWarningResponse,
  calculateConfidenceAlignment,
} from "./dimensions.js";

/**
 * Calculate the vibe coding score from pre-collected inputs.
 * Pure function — no database access.
 */
export function calculateScore(input: ScoreInput): ScoreCalculation {
  const teamTrust = calculateTeamTrust(input);
  const reviewEngagement = calculateReviewEngagement(input);
  const warningResponse = calculateWarningResponse(input);
  const confidenceAlignment = calculateConfidenceAlignment(input);

  const overall = Math.min(100, Math.max(0,
    teamTrust.score + reviewEngagement.score + warningResponse.score + confidenceAlignment.score,
  ));

  const events = [
    ...teamTrust.events,
    ...reviewEngagement.events,
    ...warningResponse.events,
    ...confidenceAlignment.events,
  ];

  return {
    overall: Math.round(overall * 100) / 100,
    dimensions: {
      team_trust: teamTrust,
      review_engagement: reviewEngagement,
      warning_response: warningResponse,
      confidence_alignment: confidenceAlignment,
    },
    events,
    computedAt: Date.now(),
  };
}

/**
 * Build ScoreInput from GraphState and history entries.
 * This is the bridge between the data layer and the pure calculator.
 */
export function buildScoreInputFromState(
  finalState: Record<string, unknown>,
  driftEntries: Array<{ resolution: string; conflicts: unknown[] }>,
  clarityEntries: Array<{ resolution: string; issues: Array<{ severity: string }> }>,
  personalityEvents: Array<{ eventType: string; content: string }>,
  previousScore?: { autoRatio: number | null; averageConfidence: number | null },
): ScoreInput {
  const approvalStats = (finalState.approval_stats ?? {}) as Record<string, unknown>;
  const taskQueue = (finalState.task_queue ?? []) as Array<Record<string, unknown>>;
  const avgConfidence = (finalState.average_confidence as number) ?? 0;

  const autoApprovedCount = (approvalStats.autoApprovedCount as number) ?? 0;
  const manualApprovedCount = (approvalStats.manualApprovedCount as number) ?? 0;
  const rejectedCount = (approvalStats.rejectedCount as number) ?? 0;
  const escalatedCount = (approvalStats.escalatedCount as number) ?? 0;

  // Count drift-related metrics
  let ignoredHardDriftCount = 0;
  let ignoredSoftDriftCount = 0;
  let driftReconsideredCount = 0;
  let hardDriftProceedCount = 0;

  for (const entry of driftEntries) {
    if (entry.resolution === "proceed") {
      // Conservative: treat entries with 2+ conflicts as hard drift
      if (entry.conflicts.length > 1) {
        ignoredHardDriftCount++;
        hardDriftProceedCount++;
      } else {
        ignoredSoftDriftCount++;
      }
    } else if (entry.resolution === "reconsider") {
      driftReconsideredCount++;
    }
  }

  // Count clarity-related metrics
  let clarityBlockingProceededCount = 0;
  let clarityIssuesAnsweredCount = 0;

  for (const entry of clarityEntries) {
    if (entry.resolution === "proceeded") {
      const hasBlocking = entry.issues.some((i) => i.severity === "blocking");
      if (hasBlocking) clarityBlockingProceededCount++;
    } else if (entry.resolution === "clarified" || entry.resolution === "rephrased") {
      clarityIssuesAnsweredCount++;
    }
  }

  // Count personality pushback ignores (block severity pushback, task completed anyway)
  const ignoredBlockPushbackCount = personalityEvents.filter(
    (e) => e.eventType === "pushback" && e.content.includes("[block]"),
  ).length;

  // Count review/rework metrics from task queue
  let skippedQaReviewCount = 0;
  let rejectedNoFeedbackCount = 0;
  let rejectedWithFeedbackCount = 0;
  let forceApprovedAfterReworkCount = 0;
  let lowConfidenceApprovedCount = 0;
  let escalatedForceProceedCount = 0;

  for (const task of taskQueue) {
    const result = (task.result as Record<string, unknown>) ?? {};
    const routing = (result.routing_decision as string) ?? "";
    const status = (task.status as string) ?? "";
    const retryCount = (task.retry_count as number) ?? 0;
    const feedback = (task.reviewer_feedback as string) ?? "";
    const confidence = result.confidence as Record<string, unknown> | undefined;
    const confScore = (confidence?.score as number) ?? 1;

    // Skipped QA: routed to qa_review but no review occurred
    if (routing === "qa_review" && status !== "needs_rework" && !feedback) {
      skippedQaReviewCount++;
    }

    // Rejected with/without feedback
    if (status === "needs_rework") {
      if (feedback && feedback.length >= 50) {
        rejectedWithFeedbackCount++;
      } else {
        rejectedNoFeedbackCount++;
      }
    }

    // Force-approved after multiple reworks
    if (status === "completed" && retryCount >= 2) {
      forceApprovedAfterReworkCount++;
    }

    // Low confidence approved (< 0.6 but completed)
    if (status === "completed" && confScore < 0.6) {
      lowConfidenceApprovedCount++;
    }

    // Escalated but force-proceeded
    if (routing === "escalate" && status === "completed") {
      escalatedForceProceedCount++;
    }
  }

  return {
    autoApprovedCount,
    manualApprovedCount,
    rejectedCount,
    escalatedCount,
    hardDriftProceedCount,
    previousAutoRatio: previousScore?.autoRatio ?? null,
    skippedQaReviewCount,
    rejectedNoFeedbackCount,
    rejectedWithFeedbackCount,
    forceApprovedAfterReworkCount,
    ignoredHardDriftCount,
    ignoredSoftDriftCount,
    driftReconsideredCount,
    clarityBlockingProceededCount,
    clarityIssuesAnsweredCount,
    ignoredBlockPushbackCount,
    averageConfidence: avgConfidence,
    previousAverageConfidence: previousScore?.averageConfidence ?? null,
    lowConfidenceApprovedCount,
    escalatedForceProceedCount,
    overridesByAgent: buildOverridesByAgent(taskQueue),
  };
}

function buildOverridesByAgent(
  taskQueue: Array<Record<string, unknown>>,
): Record<string, number> {
  const overrides: Record<string, number> = {};
  for (const task of taskQueue) {
    const result = (task.result as Record<string, unknown>) ?? {};
    const routing = (result.routing_decision as string) ?? "";
    const botId = (task.assigned_to as string) ?? "";
    if (routing === "manual_approved" || routing === "user_approved") {
      overrides[botId] = (overrides[botId] ?? 0) + 1;
    }
  }
  return overrides;
}
