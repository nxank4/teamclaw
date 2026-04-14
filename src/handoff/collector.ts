import type { Decision } from "../journal/types.js";
import type { HandoffData, LeftToDoItem, TeamPerformanceEntry } from "./types.js";
import { deriveCurrentState } from "./state-deriver.js";
import { generateResumeCommands } from "./resume-generator.js";

export interface CollectorInput {
  sessionId: string;
  projectPath: string;
  goal: string;
  taskQueue: Array<Record<string, unknown>>;
  nextSprintBacklog: Array<Record<string, unknown>>;
  promotedThisRun: string[];
  agentProfiles: Array<Record<string, unknown>>;
  activeDecisions: Decision[];
  rfcDocument: string | null;
}

function deriveSessionStatus(
  taskQueue: Array<Record<string, unknown>>,
): HandoffData["sessionStatus"] {
  const completed = taskQueue.filter((t) => t.status === "completed").length;
  const failed = taskQueue.filter((t) => t.status === "failed").length;

  if (failed === 0) return "complete";
  if (failed >= completed) return "failed";
  return "partial";
}

function buildLeftToDo(
  backlog: Array<Record<string, unknown>>,
  rfcDocument: string | null,
): LeftToDoItem[] {
  const items: LeftToDoItem[] = backlog.map((item) => {
    if (item.escalated) {
      return {
        description: String(item.description ?? ""),
        type: "escalated" as const,
        priority: "high" as const,
      };
    }
    if (item.deferred) {
      return {
        description: String(item.description ?? ""),
        type: "deferred" as const,
        priority: "medium" as const,
      };
    }
    return {
      description: String(item.description ?? ""),
      type: "open_task" as const,
      priority: "medium" as const,
    };
  });

  if (rfcDocument) {
    const headingMatch = rfcDocument.match(/^#\s+(.+)/m);
    const title = headingMatch ? headingMatch[1].trim() : "Unnamed RFC";
    items.push({
      description: `Execute ${title} — approved, not started`,
      type: "approved_rfc",
      priority: "high",
    });
  }

  return items;
}

function buildTeamPerformance(
  profiles: Array<Record<string, unknown>>,
): TeamPerformanceEntry[] {
  return profiles.map((p) => {
    const role = String(p.role ?? "unknown");
    const scoreHistory = (p.scoreHistory ?? []) as number[];
    const overallScore = Number(p.overallScore ?? 0);
    const strengths = (p.strengths ?? []) as string[];

    let trend = "stable";
    if (scoreHistory.length >= 2) {
      const recent = scoreHistory[scoreHistory.length - 1];
      const previous = scoreHistory[scoreHistory.length - 2];
      const diff = recent - previous;
      if (diff > 0.03) trend = "improving";
      else if (diff < -0.03) trend = "degrading";
    }

    return {
      agentRole: role,
      trend,
      avgConfidence: overallScore,
      note: strengths.length > 0 ? `strong on ${strengths[0]}` : "",
    };
  });
}

export function buildHandoffData(input: CollectorInput): HandoffData {
  const completedTasks = input.taskQueue
    .filter((t) => t.status === "completed")
    .map((t) => ({
      description: String(t.description ?? ""),
      confidence: Number(t.confidence ?? 0),
    }));

  const activeDecisions = input.activeDecisions
    .filter((d) => d.status === "active")
    .sort((a, b) => b.capturedAt - a.capturedAt)
    .slice(0, 5);

  const leftToDo = buildLeftToDo(input.nextSprintBacklog, input.rfcDocument);

  return {
    generatedAt: Date.now(),
    sessionId: input.sessionId,
    projectPath: input.projectPath,
    completedGoal: input.goal,
    sessionStatus: deriveSessionStatus(input.taskQueue),
    currentState: deriveCurrentState(completedTasks),
    activeDecisions,
    leftToDo,
    teamLearnings: input.promotedThisRun.slice(0, 5),
    teamPerformance: buildTeamPerformance(input.agentProfiles),
    resumeCommands: generateResumeCommands(leftToDo, activeDecisions.length),
  };
}
