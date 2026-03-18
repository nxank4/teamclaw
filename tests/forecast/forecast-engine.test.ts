import { describe, it, expect } from "vitest";
import { generateForecast } from "@/forecast/engine.js";
import type { PreviewTask } from "@/graph/preview/types.js";
import type { SimilarRun } from "@/forecast/types.js";
import type { AgentProfileData } from "@/forecast/methods/profile-based.js";

const defaultTasks: PreviewTask[] = [
  { task_id: "t-1", description: "Implement auth module", assigned_to: "worker_task", complexity: "MEDIUM", dependencies: [] },
  { task_id: "t-2", description: "Write tests", assigned_to: "worker_task", complexity: "LOW", dependencies: ["t-1"] },
];

describe("generateForecast", () => {
  it("selects historical method when >= 3 similar runs available", () => {
    const similarRuns: SimilarRun[] = [
      { sessionId: "s1", goal: "Build auth", totalCostUSD: 0.1, averageConfidence: 0.8, totalRuns: 2, teamComposition: ["worker"], similarity: 0.9 },
      { sessionId: "s2", goal: "Build auth", totalCostUSD: 0.12, averageConfidence: 0.85, totalRuns: 2, teamComposition: ["worker"], similarity: 0.85 },
      { sessionId: "s3", goal: "Build auth", totalCostUSD: 0.09, averageConfidence: 0.82, totalRuns: 2, teamComposition: ["worker"], similarity: 0.88 },
    ];

    const forecast = generateForecast({
      sessionId: "new-sess",
      goal: "Build auth module",
      tasks: defaultTasks,
      model: "claude-sonnet-4-6",
      similarRuns,
    });

    expect(forecast.forecastMethod).toBe("historical");
    expect(forecast.confidenceLevel).toBe("high");
    expect(forecast.similarRunsCount).toBe(3);
  });

  it("selects profile-based when profiles have >= 5 samples", () => {
    const profiles: AgentProfileData[] = [{
      agentRole: "worker_task",
      taskTypeScores: [
        { taskType: "implement", averageConfidence: 0.85, totalTasksCompleted: 10, averageReworkCount: 0.2 },
        { taskType: "test", averageConfidence: 0.9, totalTasksCompleted: 8, averageReworkCount: 0.1 },
      ],
      overallScore: 0.87,
      totalTasksCompleted: 18,
    }];

    const forecast = generateForecast({
      sessionId: "new-sess",
      goal: "Build auth module",
      tasks: defaultTasks,
      model: "claude-sonnet-4-6",
      profiles,
    });

    expect(forecast.forecastMethod).toBe("profile_based");
    expect(forecast.confidenceLevel).toBe("medium");
  });

  it("falls back to heuristic when no data available", () => {
    const forecast = generateForecast({
      sessionId: "new-sess",
      goal: "Build auth module",
      tasks: defaultTasks,
      model: "claude-sonnet-4-6",
    });

    expect(forecast.forecastMethod).toBe("heuristic");
    expect(forecast.confidenceLevel).toBe("low");
    expect(forecast.confidenceReason).toContain("no similar past runs");
  });

  it("produces valid cost range", () => {
    const forecast = generateForecast({
      sessionId: "new-sess",
      goal: "Build auth",
      tasks: defaultTasks,
      model: "claude-sonnet-4-6",
    });

    expect(forecast.estimatedMinUSD).toBeGreaterThan(0);
    expect(forecast.estimatedMidUSD).toBeGreaterThanOrEqual(forecast.estimatedMinUSD);
    expect(forecast.estimatedMaxUSD).toBeGreaterThanOrEqual(forecast.estimatedMidUSD);
  });

  it("generates agent forecasts", () => {
    const forecast = generateForecast({
      sessionId: "new-sess",
      goal: "Build auth",
      tasks: defaultTasks,
      model: "claude-sonnet-4-6",
    });

    expect(forecast.agentForecasts.length).toBeGreaterThanOrEqual(1);
    expect(forecast.agentForecasts[0].estimatedTasks).toBeGreaterThan(0);
  });

  it("generates phase forecasts", () => {
    const forecast = generateForecast({
      sessionId: "new-sess",
      goal: "Build auth",
      tasks: defaultTasks,
      model: "claude-sonnet-4-6",
    });

    expect(forecast.phaseForecasts.length).toBeGreaterThan(0);
    const phases = forecast.phaseForecasts.map((p) => p.phase);
    expect(phases).toContain("execution");
  });

  it("multi-run projection shows savings", () => {
    const forecast = generateForecast({
      sessionId: "new-sess",
      goal: "Build auth",
      tasks: defaultTasks,
      model: "claude-sonnet-4-6",
      runs: 3,
    });

    expect(forecast.multiRunProjection.runs).toBe(3);
    expect(forecast.multiRunProjection.projectedCost).toBeLessThan(forecast.multiRunProjection.naiveCost);
    expect(forecast.multiRunProjection.savingsPct).toBeGreaterThan(0);
  });

  it("works standalone without sprint context", () => {
    const forecast = generateForecast({
      sessionId: "forecast-preview",
      goal: "Create a REST API for user management",
      tasks: [
        { task_id: "t-1", description: "Design API schema", assigned_to: "worker_task", complexity: "HIGH", dependencies: [] },
        { task_id: "t-2", description: "Implement endpoints", assigned_to: "worker_task", complexity: "MEDIUM", dependencies: ["t-1"] },
        { task_id: "t-3", description: "Write integration tests", assigned_to: "worker_task", complexity: "LOW", dependencies: ["t-2"] },
      ],
      model: "claude-sonnet-4-6",
    });

    expect(forecast.sessionId).toBe("forecast-preview");
    expect(forecast.estimatedMidUSD).toBeGreaterThan(0);
  });
});
