/**
 * Template-based tip selection based on lowest-scoring dimension.
 */

import type { ScoreCalculation, ScoreInput, DimensionName } from "./types.js";

interface TipTemplate {
  template: string;
}

const TIPS: Record<DimensionName, TipTemplate[]> = {
  team_trust: [
    { template: "Try auto-approving more tasks to build trust with your team. You manually overrode {n} times." },
    { template: "Your team works best when you trust their judgment — consider letting more tasks auto-approve." },
  ],
  review_engagement: [
    { template: "When rejecting work, include detailed feedback so agents can learn. {n} rejection(s) had no feedback." },
    { template: "Review agent outputs before they auto-complete — {n} QA review(s) were skipped." },
  ],
  warning_response: [
    { template: "Drift warnings highlight real conflicts. Consider reconsidering instead of proceeding past {n} warning(s)." },
    { template: "Clarity issues flag ambiguity in your goals. Addressing them leads to better results." },
  ],
  confidence_alignment: [
    { template: "Low-confidence tasks ({n} approved) may need more attention before proceeding." },
    { template: "Team confidence is trending down. Review task decomposition and agent assignments." },
  ],
};

/**
 * Select a tip based on the lowest-scoring dimension.
 * Fills template placeholders with actual data.
 */
export function selectTip(calc: ScoreCalculation, input: ScoreInput): string {
  const dimensions = calc.dimensions;
  const lowest = (Object.entries(dimensions) as Array<[DimensionName, { score: number }]>)
    .sort((a, b) => a[1].score - b[1].score)[0];

  if (!lowest) return "Keep collaborating with your team!";

  const [dimName] = lowest;
  const templates = TIPS[dimName];
  const template = templates[0]!;

  const n = getRelevantCount(dimName, input);
  return template.template.replace(/\{n\}/g, String(n));
}

function getRelevantCount(dim: DimensionName, input: ScoreInput): number {
  switch (dim) {
    case "team_trust":
      return input.manualApprovedCount;
    case "review_engagement":
      return Math.max(input.rejectedNoFeedbackCount, input.skippedQaReviewCount);
    case "warning_response":
      return input.ignoredHardDriftCount + input.ignoredSoftDriftCount;
    case "confidence_alignment":
      return input.lowConfidenceApprovedCount;
  }
}
