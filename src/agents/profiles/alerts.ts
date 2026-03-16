/**
 * Degradation alerting for agent performance profiles.
 */

import type { AgentProfile, ProfileAlert } from "./types.js";

const DEGRADATION_THRESHOLD = -0.1;
const MIN_HISTORY_LENGTH = 20;

/**
 * Check if a profile shows significant score degradation over its history.
 * Returns an alert if the score has dropped by more than 0.1 over the last 20 entries.
 */
export function checkDegradation(profile: AgentProfile): ProfileAlert | null {
  const history = profile.scoreHistory;
  if (history.length < MIN_HISTORY_LENGTH) return null;

  const oldest = history[0];
  const newest = history[history.length - 1];
  const delta = newest - oldest;

  if (delta < DEGRADATION_THRESHOLD) {
    return {
      agentRole: profile.agentRole,
      previousScore: oldest,
      currentScore: newest,
      alertAt: Date.now(),
    };
  }

  return null;
}
