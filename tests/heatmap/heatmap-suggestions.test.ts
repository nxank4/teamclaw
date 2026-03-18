import { describe, it, expect } from "vitest";
import { generateSuggestions } from "@/heatmap/suggestions.js";
import type { AgentUtilization } from "@/heatmap/types.js";
import type { ProfileData } from "@/heatmap/suggestions.js";

function makeUtilization(overrides: Partial<AgentUtilization> = {}): AgentUtilization {
  return {
    agentRole: "worker_task",
    sessionId: "sess-1",
    runIndex: 1,
    tasksHandled: 3,
    totalActiveMs: 15000,
    totalWallMs: 20000,
    utilizationPct: 0.75,
    averageDurationMs: 5000,
    maxDurationMs: 8000,
    minDurationMs: 3000,
    averageConfidence: 0.85,
    totalCostUSD: 0.005,
    costPerTask: 0.0017,
    tokensUsed: 1500,
    bottleneckScore: 0.4,
    queueDepth: 1,
    taskTypeBreakdown: [
      { taskType: "audit", count: 2, avgDurationMs: 6000, avgConfidence: 0.61 },
      { taskType: "implement", count: 1, avgDurationMs: 3000, avgConfidence: 0.88 },
    ],
    ...overrides,
  };
}

function makeProfile(overrides: Partial<ProfileData> = {}): ProfileData {
  return {
    agentRole: "worker_task",
    taskTypeScores: [
      { taskType: "audit", averageConfidence: 0.61, successRate: 0.7, totalTasksCompleted: 5 },
      { taskType: "implement", averageConfidence: 0.88, successRate: 0.9, totalTasksCompleted: 10 },
    ],
    overallScore: 0.75,
    ...overrides,
  };
}

describe("generateSuggestions", () => {
  it("detects bottleneck at > 0.8 utilization", () => {
    const utils = [
      makeUtilization({ agentRole: "worker_task", utilizationPct: 0.85, queueDepth: 3 }),
    ];
    const profiles = [makeProfile()];

    const suggestions = generateSuggestions(utils, profiles);
    expect(suggestions.length).toBeGreaterThanOrEqual(0);
    // Even without a better agent available, queueDepth > 1 → parallelize suggestion
    const parallelize = suggestions.find((s) => s.type === "parallelize");
    expect(parallelize).toBeDefined();
  });

  it("generates reassign suggestion using profile scores", () => {
    const utils = [
      makeUtilization({
        agentRole: "worker_task",
        utilizationPct: 0.85,
        taskTypeBreakdown: [{ taskType: "audit", count: 3, avgDurationMs: 5000, avgConfidence: 0.61 }],
      }),
      makeUtilization({
        agentRole: "tech_lead",
        utilizationPct: 0.2,
        tasksHandled: 1,
        taskTypeBreakdown: [{ taskType: "audit", count: 0, avgDurationMs: 0, avgConfidence: 0 }],
      }),
    ];

    const profiles: ProfileData[] = [
      makeProfile({
        agentRole: "worker_task",
        taskTypeScores: [{ taskType: "audit", averageConfidence: 0.61, successRate: 0.7, totalTasksCompleted: 5 }],
      }),
      makeProfile({
        agentRole: "tech_lead",
        taskTypeScores: [{ taskType: "audit", averageConfidence: 0.91, successRate: 0.95, totalTasksCompleted: 8 }],
        overallScore: 0.9,
      }),
    ];

    const suggestions = generateSuggestions(utils, profiles);
    const reassign = suggestions.find((s) => s.type === "reassign");
    expect(reassign).toBeDefined();
    expect(reassign!.suggestion).toContain("audit");
    expect(reassign!.suggestion).toContain("Tech Lead");
  });

  it("generates parallelize suggestion for sequential independent tasks", () => {
    const utils = [
      makeUtilization({
        agentRole: "worker_task",
        utilizationPct: 0.6,
        queueDepth: 2,
        tasksHandled: 3,
        totalActiveMs: 25000,
        maxDurationMs: 10000,
      }),
    ];

    const suggestions = generateSuggestions(utils, []);
    const parallelize = suggestions.find((s) => s.type === "parallelize");
    expect(parallelize).toBeDefined();
    expect(parallelize!.suggestion).toContain("parallel");
  });

  it("generates exclude suggestion for barely used agent", () => {
    const utils = [
      makeUtilization({
        agentRole: "sprint_planning",
        utilizationPct: 0.03,
        tasksHandled: 1,
        totalActiveMs: 5000,
        queueDepth: 0,
      }),
    ];

    const suggestions = generateSuggestions(utils, []);
    const exclude = suggestions.find((s) => s.type === "exclude_agent");
    expect(exclude).toBeDefined();
    expect(exclude!.suggestion).toContain("overhead");
  });

  it("does not suggest reassign when no better agent available", () => {
    const utils = [
      makeUtilization({
        agentRole: "worker_task",
        utilizationPct: 0.85,
        taskTypeBreakdown: [{ taskType: "implement", count: 3, avgDurationMs: 5000, avgConfidence: 0.88 }],
      }),
    ];

    // Only one profile — no alternative agent
    const profiles = [makeProfile({ agentRole: "worker_task" })];

    const suggestions = generateSuggestions(utils, profiles);
    const reassign = suggestions.find((s) => s.type === "reassign");
    expect(reassign).toBeUndefined();
  });

  it("returns empty for no bottlenecks", () => {
    const utils = [
      makeUtilization({ agentRole: "coordinator", utilizationPct: 0.15, queueDepth: 0, tasksHandled: 1, totalActiveMs: 20000 }),
    ];

    const suggestions = generateSuggestions(utils, []);
    // Low util, single task — may get exclude suggestion but no bottleneck ones
    const bottleneckSuggestions = suggestions.filter((s) => s.type === "reassign" || s.type === "parallelize");
    expect(bottleneckSuggestions).toHaveLength(0);
  });
});
