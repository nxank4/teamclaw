/**
 * Analyzes a goal and produces a TeamComposition selecting which agents to activate.
 */

import type { ActiveAgent, ExcludedAgent, TeamComposition } from "./types.js";
import { REQUIRED_AGENTS } from "./types.js";
import { AGENT_INCLUSION_RULES, shouldIncludeAgent } from "./rules.js";

export interface AnalyzeGoalOptions {
  runCount?: number;
}

/**
 * Analyze a goal string and determine which agents should be active.
 * Required agents are always included. Optional agents are selected via keyword rules.
 */
export function analyzeGoal(
  goal: string,
  options?: AnalyzeGoalOptions,
): TeamComposition {
  const goalLower = goal.toLowerCase();
  const activeAgents: ActiveAgent[] = [];
  const excludedAgents: ExcludedAgent[] = [];

  // Required agents always active
  for (const role of REQUIRED_AGENTS) {
    activeAgents.push({
      role,
      reason: "Required agent — always active",
      confidence: 1.0,
    });
  }

  // Evaluate optional agents via keyword rules
  for (const rule of AGENT_INCLUSION_RULES) {
    const result = shouldIncludeAgent(rule, goalLower, {
      runCount: options?.runCount,
    });

    if (result.include) {
      activeAgents.push({
        role: rule.role,
        reason: result.reason,
        confidence: result.confidence,
      });
    } else {
      excludedAgents.push({
        role: rule.role,
        reason: result.reason,
      });
    }
  }

  // Overall confidence = average of active agent confidences
  const overallConfidence =
    activeAgents.length > 0
      ? activeAgents.reduce((sum, a) => sum + a.confidence, 0) / activeAgents.length
      : 0;

  return {
    mode: "autonomous",
    activeAgents,
    excludedAgents,
    overallConfidence: Math.round(overallConfidence * 100) / 100,
    analyzedGoal: goal,
    analyzedAt: new Date().toISOString(),
  };
}
