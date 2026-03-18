import { describe, it, expect } from "vitest";
import { ProfileRouter } from "@/agents/profiles/router.js";
import { checkDegradation } from "@/agents/profiles/alerts.js";
import { formatProfilesForPrompt } from "@/agents/profiles/prompt.js";
import type { AgentProfile } from "@/agents/profiles/types.js";
import type { BotDefinition } from "@/core/bot-definitions.js";

const team: BotDefinition[] = [
  { id: "bot_0", name: "Maker", role_id: "software_engineer", traits: {}, worker_url: "" },
  { id: "bot_1", name: "Reviewer", role_id: "qa_reviewer", traits: {}, worker_url: "" },
];

function makeProfile(role: string, overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    agentRole: role,
    taskTypeScores: [],
    overallScore: 0.7,
    strengths: [],
    weaknesses: [],
    lastUpdatedAt: Date.now(),
    totalTasksCompleted: 15,
    scoreHistory: [0.7],
    ...overrides,
  };
}

describe("ProfileRouter", () => {
  it("returns original assignment with IGNORE_PROFILE when insufficient data", () => {
    const profiles = [makeProfile("software_engineer", { totalTasksCompleted: 3 })];
    const router = new ProfileRouter(profiles, team);
    const decision = router.route({
      taskId: "T1",
      description: "Implement user auth",
      assignedTo: "bot_0",
    });
    expect(decision.reason).toBe("insufficient_data");
    expect(decision.profileConfidence).toBe(0);
  });

  it("picks highest-scored eligible agent with USE_PROFILE", () => {
    const profiles = [
      makeProfile("software_engineer", {
        totalTasksCompleted: 15,
        taskTypeScores: [{
          taskType: "implement",
          averageConfidence: 0.9,
          successRate: 0.95,
          averageReworkCount: 0.1,
          totalTasksCompleted: 10,
          trend: "stable",
        }],
      }),
      makeProfile("qa_reviewer", {
        totalTasksCompleted: 15,
        taskTypeScores: [{
          taskType: "implement",
          averageConfidence: 0.5,
          successRate: 0.3,
          averageReworkCount: 2,
          totalTasksCompleted: 10,
          trend: "degrading",
        }],
      }),
    ];
    const router = new ProfileRouter(profiles, team);
    const decision = router.route({
      taskId: "T1",
      description: "Implement new feature",
      assignedTo: "bot_1", // assigned to reviewer
    });
    // Should prefer software_engineer (higher score)
    expect(decision.assignedAgent).toBe("software_engineer");
    expect(decision.profileConfidence).toBeGreaterThan(0);
  });

  it("confirms original assignment when it's already the best", () => {
    const profiles = [
      makeProfile("software_engineer", {
        totalTasksCompleted: 15,
        taskTypeScores: [{
          taskType: "implement",
          averageConfidence: 0.9,
          successRate: 0.95,
          averageReworkCount: 0,
          totalTasksCompleted: 10,
          trend: "stable",
        }],
      }),
    ];
    const router = new ProfileRouter(profiles, team);
    const decision = router.route({
      taskId: "T1",
      description: "Implement login",
      assignedTo: "bot_0",
    });
    expect(decision.reason).toBe("profile_confirms_assignment");
  });

  it("returns all original assignments when no profiles exist", () => {
    const router = new ProfileRouter([], team);
    const decision = router.route({
      taskId: "T1",
      description: "Implement feature",
      assignedTo: "bot_0",
    });
    // No profiles → IGNORE_PROFILE (totalTasks=0)
    expect(decision.reason).toBe("insufficient_data");
  });

  it("blends scores for PARTIAL_WEIGHT gate", () => {
    const profiles = [
      makeProfile("software_engineer", {
        totalTasksCompleted: 7, // Between 5-9 → PARTIAL_WEIGHT
        taskTypeScores: [{
          taskType: "implement",
          averageConfidence: 0.9,
          successRate: 0.95,
          averageReworkCount: 0,
          totalTasksCompleted: 5,
          trend: "stable",
        }],
      }),
    ];
    const router = new ProfileRouter(profiles, team);
    const decision = router.route({
      taskId: "T1",
      description: "Implement something",
      assignedTo: "bot_0",
    });
    // Should still route (PARTIAL_WEIGHT doesn't mean ignore)
    expect(decision.profileConfidence).toBeGreaterThan(0);
  });
});

describe("checkDegradation", () => {
  it("returns null when history is too short", () => {
    const profile = makeProfile("test", { scoreHistory: [0.8, 0.7] });
    expect(checkDegradation(profile)).toBeNull();
  });

  it("returns alert when score drops significantly over 20 entries", () => {
    const history = Array.from({ length: 20 }, (_, i) => 0.9 - i * 0.01);
    // First: 0.9, Last: 0.71 → delta = -0.19
    const profile = makeProfile("test", { scoreHistory: history });
    const alert = checkDegradation(profile);
    expect(alert).not.toBeNull();
    expect(alert!.agentRole).toBe("test");
    expect(alert!.previousScore).toBeCloseTo(0.9);
  });

  it("returns null when scores are stable", () => {
    const history = Array.from({ length: 20 }, () => 0.8);
    const profile = makeProfile("test", { scoreHistory: history });
    expect(checkDegradation(profile)).toBeNull();
  });
});

describe("formatProfilesForPrompt", () => {
  it("returns empty string for no profiles", () => {
    expect(formatProfilesForPrompt([])).toBe("");
  });

  it("includes role, score, strengths, weaknesses", () => {
    const profiles = [
      makeProfile("software_engineer", {
        overallScore: 0.85,
        strengths: ["implement", "debug"],
        weaknesses: ["test"],
        totalTasksCompleted: 20,
      }),
    ];
    const output = formatProfilesForPrompt(profiles);
    expect(output).toContain("software_engineer");
    expect(output).toContain("85%");
    expect(output).toContain("implement, debug");
    expect(output).toContain("test");
  });
});
