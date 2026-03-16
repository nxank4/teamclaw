/**
 * ProfileRouter — routes tasks to the historically best-performing agent.
 * Uses confidence gating to decide how much weight profiles carry.
 */

import type { AgentProfile, RoutingDecision, TaskType } from "./types.js";
import type { BotDefinition } from "../../core/bot-definitions.js";
import { ROLE_TEMPLATES } from "../../core/bot-definitions.js";
import { classifyTaskType, getConfidenceGate } from "./classifier.js";

/**
 * Check if a role's registered task_types overlap with keywords
 * associated with the classified task type.
 */
function isRoleEligible(roleId: string, _taskType: TaskType): boolean {
  const template = ROLE_TEMPLATES[roleId];
  if (!template) return false;
  // All roles with task_types defined are considered eligible
  // (the coordinator already restricts which tasks go to which roles)
  return template.task_types.length > 0;
}

function scoreRole(profile: AgentProfile | undefined, taskType: TaskType): number {
  if (!profile) return 0.5;
  const typeScore = profile.taskTypeScores.find((s) => s.taskType === taskType);
  if (!typeScore) return 0.5;

  const successWeight = typeScore.successRate * 0.5;
  const confidenceWeight = typeScore.averageConfidence * 0.3;
  const reworkPenalty = Math.max(0, (1 - typeScore.averageReworkCount / 5)) * 0.2;
  return successWeight + confidenceWeight + reworkPenalty;
}

export class ProfileRouter {
  private readonly profileMap: Map<string, AgentProfile>;
  private readonly team: BotDefinition[];

  constructor(profiles: AgentProfile[], team: BotDefinition[]) {
    this.profileMap = new Map();
    for (const p of profiles) {
      this.profileMap.set(p.agentRole, p);
    }
    this.team = team;
  }

  route(task: { taskId: string; description: string; assignedTo: string }): RoutingDecision {
    const taskType = classifyTaskType(task.description);

    // Resolve assigned bot's role_id
    const assignedBot = this.team.find((b) => b.id === task.assignedTo);
    const assignedRoleId = assignedBot?.role_id ?? task.assignedTo;

    // Check confidence gate for the assigned agent's profile
    const assignedProfile = this.profileMap.get(assignedRoleId);
    const totalTasks = assignedProfile?.totalTasksCompleted ?? 0;
    const gate = getConfidenceGate(totalTasks);

    if (gate === "IGNORE_PROFILE") {
      return {
        taskId: task.taskId,
        assignedAgent: assignedRoleId,
        reason: "insufficient_data",
        alternativeAgents: [],
        profileConfidence: 0,
      };
    }

    // Score all eligible team bots
    const candidates: Array<{ roleId: string; botId: string; score: number }> = [];
    const seenRoles = new Set<string>();

    for (const bot of this.team) {
      if (seenRoles.has(bot.role_id)) continue;
      if (!isRoleEligible(bot.role_id, taskType)) continue;
      seenRoles.add(bot.role_id);

      const profile = this.profileMap.get(bot.role_id);
      const score = scoreRole(profile, taskType);
      candidates.push({ roleId: bot.role_id, botId: bot.id, score });
    }

    if (candidates.length === 0) {
      return {
        taskId: task.taskId,
        assignedAgent: assignedRoleId,
        reason: "no_eligible_candidates",
        alternativeAgents: [],
        profileConfidence: 0,
      };
    }

    // For PARTIAL_WEIGHT, blend default and profile scores
    if (gate === "PARTIAL_WEIGHT") {
      for (const c of candidates) {
        c.score = 0.5 * 0.5 + 0.5 * c.score;
      }
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const alternatives = candidates
      .slice(1)
      .map((c) => ({ role: c.roleId, score: c.score }));

    const reason = best.roleId === assignedRoleId
      ? "profile_confirms_assignment"
      : "profile_suggests_reroute";

    return {
      taskId: task.taskId,
      assignedAgent: best.roleId,
      reason,
      alternativeAgents: alternatives,
      profileConfidence: best.score,
    };
  }
}
