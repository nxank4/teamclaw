import { describe, it, expect } from "vitest";
import { forecastProfileBased } from "@/forecast/methods/profile-based.js";
import type { AgentProfileData } from "@/forecast/methods/profile-based.js";
import type { PreviewTask } from "@/graph/preview/types.js";

const tasks: PreviewTask[] = [
  { task_id: "t-1", description: "Implement auth module", assigned_to: "worker_task", complexity: "MEDIUM", dependencies: [] },
  { task_id: "t-2", description: "Write test suite", assigned_to: "worker_task", complexity: "LOW", dependencies: ["t-1"] },
];

describe("forecastProfileBased", () => {
  it("returns null when no profiles available", () => {
    expect(forecastProfileBased(tasks, [], "sonnet")).toBeNull();
  });

  it("returns null when profiles lack sufficient samples", () => {
    const profiles: AgentProfileData[] = [{
      agentRole: "worker_task",
      taskTypeScores: [{ taskType: "implement", averageConfidence: 0.8, totalTasksCompleted: 2, averageReworkCount: 0.5 }],
      overallScore: 0.8,
      totalTasksCompleted: 2,
    }];
    expect(forecastProfileBased(tasks, profiles, "sonnet")).toBeNull();
  });

  it("correctly estimates tokens from avg per task type", () => {
    const profiles: AgentProfileData[] = [{
      agentRole: "worker_task",
      taskTypeScores: [
        { taskType: "implement", averageConfidence: 0.85, totalTasksCompleted: 10, averageReworkCount: 0.2 },
        { taskType: "test", averageConfidence: 0.9, totalTasksCompleted: 8, averageReworkCount: 0.1 },
      ],
      overallScore: 0.87,
      totalTasksCompleted: 18,
    }];

    const result = forecastProfileBased(tasks, profiles, "sonnet");
    expect(result).not.toBeNull();
    expect(result!.agentForecasts).toHaveLength(1);
    expect(result!.agentForecasts[0].estimatedTokens).toBeGreaterThan(0);
    expect(result!.estimatedMidUSD).toBeGreaterThan(0);
  });

  it("higher confidence profiles produce lower cost estimates", () => {
    const highConfProfiles: AgentProfileData[] = [{
      agentRole: "worker_task",
      taskTypeScores: [{ taskType: "implement", averageConfidence: 0.95, totalTasksCompleted: 20, averageReworkCount: 0.05 }],
      overallScore: 0.95,
      totalTasksCompleted: 20,
    }];

    const lowConfProfiles: AgentProfileData[] = [{
      agentRole: "worker_task",
      taskTypeScores: [{ taskType: "implement", averageConfidence: 0.5, totalTasksCompleted: 20, averageReworkCount: 1.5 }],
      overallScore: 0.5,
      totalTasksCompleted: 20,
    }];

    const simpleTasks: PreviewTask[] = [
      { task_id: "t-1", description: "Implement feature", assigned_to: "worker_task", complexity: "MEDIUM", dependencies: [] },
    ];

    const highResult = forecastProfileBased(simpleTasks, highConfProfiles, "sonnet")!;
    const lowResult = forecastProfileBased(simpleTasks, lowConfProfiles, "sonnet")!;

    // Lower confidence = more reworks = more tokens = higher cost
    expect(lowResult.estimatedMidUSD).toBeGreaterThan(highResult.estimatedMidUSD);
  });
});
