import type { CoordinatorInterventionResult } from "./types.js";
import { getPersonality } from "./profiles.js";

interface ConfidenceHistoryEntry {
  task_id: string;
  status_before: string;
  status_after: string;
  [key: string]: unknown;
}

interface GraphStateLike {
  confidence_history?: ConfidenceHistoryEntry[];
  [key: string]: unknown;
}

export function detectCoordinatorIntervention(
  state: GraphStateLike,
): CoordinatorInterventionResult | null {
  const history = state.confidence_history;
  if (!history || history.length === 0) return null;

  // Count rework cycles per task
  const reworkCounts = new Map<string, number>();
  for (const entry of history) {
    const taskId = entry.task_id;
    if (entry.status_before === "needs_rework" || entry.status_after === "needs_rework") {
      reworkCounts.set(taskId, (reworkCounts.get(taskId) ?? 0) + 1);
    }
  }

  // Find tasks with > 2 rework cycles
  for (const [taskId, count] of reworkCounts) {
    if (count > 2) {
      const coordinator = getPersonality("coordinator");
      const catchphrase = coordinator.catchphrases[0] ?? "Decision time.";

      return {
        message: `Round ${count} on task ${taskId}. ${catchphrase} Accepting current output at reduced confidence. This is blocking the sprint — deciding now. We can revisit in retrospective.`,
        taskId,
        visitCount: count,
      };
    }
  }

  return null;
}
