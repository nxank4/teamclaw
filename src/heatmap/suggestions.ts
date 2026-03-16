/**
 * Bottleneck detection and optimization suggestions.
 * Suggestions reference actual profile data — never generic advice.
 */

import type { AgentUtilization, OptimizationSuggestion, SuggestionType } from "./types.js";

export interface ProfileData {
  agentRole: string;
  taskTypeScores: {
    taskType: string;
    averageConfidence: number;
    successRate: number;
    totalTasksCompleted: number;
  }[];
  overallScore: number;
}

export interface SuggestionOptions {
  /** Utilization threshold above which an agent is a bottleneck. Default: 0.8. */
  bottleneckThreshold?: number;
}

const DEFAULT_THRESHOLD = 0.8;

/**
 * Generate optimization suggestions based on utilization and profile data.
 * Only generates suggestions backed by actual data.
 */
export function generateSuggestions(
  utilizations: AgentUtilization[],
  profiles: ProfileData[],
  options: SuggestionOptions = {},
): OptimizationSuggestion[] {
  const threshold = options.bottleneckThreshold ?? DEFAULT_THRESHOLD;
  const suggestions: OptimizationSuggestion[] = [];

  const profileMap = new Map(profiles.map((p) => [p.agentRole, p]));

  for (const util of utilizations) {
    const isBottleneck = util.utilizationPct >= threshold || util.queueDepth > 2;

    // Reassign: another agent has higher score for this task type
    if (isBottleneck) {
      suggestions.push(...generateReassignSuggestions(util, profileMap, utilizations));
    }

    // Parallelize: sequential tasks with no dependencies
    if (util.queueDepth > 1 && util.tasksHandled >= 2) {
      suggestions.push(...generateParallelizeSuggestions(util));
    }

    // Exclude: barely used agent adding overhead
    if (util.utilizationPct < 0.05 && util.tasksHandled <= 1 && util.totalActiveMs < 10000) {
      suggestions.push(generateExcludeSuggestion(util));
    }
  }

  return suggestions;
}

function generateReassignSuggestions(
  bottleneck: AgentUtilization,
  profileMap: Map<string, ProfileData>,
  allUtilizations: AgentUtilization[],
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];
  const bottleneckProfile = profileMap.get(bottleneck.agentRole);

  for (const taskBreakdown of bottleneck.taskTypeBreakdown) {
    if (taskBreakdown.count === 0) continue;

    // Find the bottleneck's score for this task type
    const bottleneckScore = bottleneckProfile?.taskTypeScores
      .find((ts) => ts.taskType === taskBreakdown.taskType)?.averageConfidence ?? 0;

    // Check if another agent with lower utilization has higher score
    for (const [role, profile] of profileMap) {
      if (role === bottleneck.agentRole) continue;

      const otherUtil = allUtilizations.find((u) => u.agentRole === role);
      if (!otherUtil || otherUtil.utilizationPct >= 0.6) continue; // Don't suggest overloaded agents

      const otherScore = profile.taskTypeScores
        .find((ts) => ts.taskType === taskBreakdown.taskType);

      if (otherScore && otherScore.averageConfidence > bottleneckScore + 0.1 && otherScore.totalTasksCompleted >= 2) {
        const delta = otherScore.averageConfidence - bottleneckScore;
        suggestions.push({
          type: "reassign",
          agentRole: bottleneck.agentRole,
          suggestion:
            `${formatName(bottleneck.agentRole)} is handling '${taskBreakdown.taskType}' tasks ` +
            `(score: ${bottleneckScore.toFixed(2)}) but ${formatName(role)} ` +
            `has higher ${taskBreakdown.taskType} score (${otherScore.averageConfidence.toFixed(2)}). ` +
            `Consider reassigning ${taskBreakdown.taskType} tasks to ${formatName(role)}.`,
          estimatedImpact: `+${delta.toFixed(2)} confidence score`,
        });
        break; // One suggestion per task type
      }
    }
  }

  return suggestions;
}

function generateParallelizeSuggestions(util: AgentUtilization): OptimizationSuggestion[] {
  if (util.tasksHandled < 2) return [];

  const totalSequential = util.totalActiveMs;
  const longestTask = util.maxDurationMs;
  const savedMs = totalSequential - longestTask;
  const savedPct = totalSequential > 0 ? Math.round((savedMs / totalSequential) * 100) : 0;

  if (savedPct < 20) return []; // Not worth suggesting if savings < 20%

  return [{
    type: "parallelize",
    agentRole: util.agentRole,
    suggestion:
      `${formatName(util.agentRole)} handled ${util.tasksHandled} tasks sequentially ` +
      `(${formatDuration(util.totalActiveMs)} total). Running in parallel would reduce to ~${formatDuration(longestTask)}.`,
    estimatedImpact: `~${savedPct}% faster`,
  }];
}

function generateExcludeSuggestion(util: AgentUtilization): OptimizationSuggestion {
  return {
    type: "exclude_agent",
    agentRole: util.agentRole,
    suggestion:
      `${formatName(util.agentRole)} used for ${util.tasksHandled} task taking ` +
      `${formatDuration(util.totalActiveMs)} (${Math.round(util.utilizationPct * 100)}% utilization). ` +
      `For single-task goals, ${formatName(util.agentRole)} adds overhead without benefit.`,
    estimatedImpact: `~${formatDuration(util.totalActiveMs)} saved`,
  };
}

function formatName(nodeId: string): string {
  return nodeId
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return `${min}m${s.toString().padStart(2, "0")}s`;
}
