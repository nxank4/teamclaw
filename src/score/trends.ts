/**
 * Trend calculation from historical vibe score entries.
 */

import type { VibeScoreEntry, ScoreTrend, TrendDirection } from "./types.js";

/**
 * Calculate trend from historical score entries.
 * Needs 2+ weekly data points for meaningful delta.
 */
export function calculateTrend(scores: VibeScoreEntry[]): ScoreTrend {
  const sorted = [...scores].sort((a, b) => b.date.localeCompare(a.date));
  const history = sorted.map((s) => ({ date: s.date, overall: s.overall }));

  if (sorted.length === 0) {
    return { current: 0, lastWeek: null, delta: null, direction: "stable", history };
  }

  const current = sorted[0]!.overall;

  if (sorted.length < 2) {
    return { current, lastWeek: null, delta: null, direction: "stable", history };
  }

  // Find entry from ~7 days ago
  const now = new Date(sorted[0]!.date);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);

  const lastWeekEntry = sorted.find((s) => s.date <= weekAgoStr);
  if (!lastWeekEntry) {
    return { current, lastWeek: null, delta: null, direction: "stable", history };
  }

  const lastWeek = lastWeekEntry.overall;
  const delta = current - lastWeek;

  // Check for plateau: delta < 2 for 2+ weeks
  let direction: TrendDirection;
  const twoWeeksAgo = new Date(now);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const twoWeeksAgoStr = twoWeeksAgo.toISOString().slice(0, 10);
  const twoWeeksEntry = sorted.find((s) => s.date <= twoWeeksAgoStr);

  if (twoWeeksEntry && Math.abs(delta) < 2) {
    const twoWeekDelta = current - twoWeeksEntry.overall;
    if (Math.abs(twoWeekDelta) < 2) {
      direction = "plateaued";
    } else {
      direction = "stable";
    }
  } else if (delta > 5) {
    direction = "improving";
  } else if (delta < -5) {
    direction = "degrading";
  } else {
    direction = "stable";
  }

  return { current, lastWeek, delta, direction, history };
}
