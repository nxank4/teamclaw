import { describe, it, expect } from "vitest";
import { analyzeGoal } from "../src/agents/composition/analyzer.js";
import { REQUIRED_AGENTS } from "../src/agents/composition/types.js";
import type { TeamComposition, AgentRole } from "../src/agents/composition/types.js";

function activeRoles(composition: TeamComposition): AgentRole[] {
  return composition.activeAgents.map((a) => a.role);
}

function excludedRoles(composition: TeamComposition): AgentRole[] {
  return composition.excludedAgents.map((a) => a.role);
}

describe("analyzeGoal", () => {
  it("always includes required agents", () => {
    const comp = analyzeGoal("fix a typo");
    for (const role of REQUIRED_AGENTS) {
      expect(activeRoles(comp)).toContain(role);
    }
  });

  it("excludes optional agents for a simple goal", () => {
    const comp = analyzeGoal("fix a typo in the readme");
    expect(excludedRoles(comp)).toContain("sprint_planning");
    expect(excludedRoles(comp)).toContain("system_design");
    expect(excludedRoles(comp)).toContain("rfc_phase");
  });

  it("includes system_design for architecture goals", () => {
    const comp = analyzeGoal("design a microservice architecture with database integration");
    expect(activeRoles(comp)).toContain("system_design");
  });

  it("includes sprint_planning for complex multi-phase goals", () => {
    const comp = analyzeGoal("plan a complex roadmap with multiple phases and milestones");
    expect(activeRoles(comp)).toContain("sprint_planning");
  });

  it("includes rfc_phase for critical migration goals", () => {
    const comp = analyzeGoal("critical security migration and architecture refactor");
    expect(activeRoles(comp)).toContain("rfc_phase");
  });

  it("includes all optional graph agents for a comprehensive goal", () => {
    const comp = analyzeGoal(
      "design the system architecture, plan complex sprint milestones, and propose an rfc for the critical migration",
    );
    expect(activeRoles(comp)).toContain("sprint_planning");
    expect(activeRoles(comp)).toContain("system_design");
    expect(activeRoles(comp)).toContain("rfc_phase");
  });

  it("includes post-graph agents for multi-run sessions", () => {
    const comp = analyzeGoal("build a feature", { runCount: 3 });
    expect(activeRoles(comp)).toContain("post_mortem");
    expect(activeRoles(comp)).toContain("retrospective");
  });

  it("excludes post-graph agents for single-run sessions", () => {
    const comp = analyzeGoal("build a feature", { runCount: 1 });
    expect(excludedRoles(comp)).toContain("post_mortem");
    expect(excludedRoles(comp)).toContain("retrospective");
  });

  it("returns valid TeamComposition shape", () => {
    const comp = analyzeGoal("any goal");
    expect(comp.mode).toBe("autonomous");
    expect(comp.analyzedGoal).toBe("any goal");
    expect(comp.analyzedAt).toBeTruthy();
    expect(typeof comp.overallConfidence).toBe("number");
    expect(comp.overallConfidence).toBeGreaterThanOrEqual(0);
    expect(comp.overallConfidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(comp.activeAgents)).toBe(true);
    expect(Array.isArray(comp.excludedAgents)).toBe(true);
  });

  it("every active agent has role, reason, and confidence", () => {
    const comp = analyzeGoal("design a complex system architecture");
    for (const agent of comp.activeAgents) {
      expect(agent.role).toBeTruthy();
      expect(agent.reason).toBeTruthy();
      expect(typeof agent.confidence).toBe("number");
    }
  });

  it("every excluded agent has role and reason", () => {
    const comp = analyzeGoal("fix a typo");
    for (const agent of comp.excludedAgents) {
      expect(agent.role).toBeTruthy();
      expect(agent.reason).toBeTruthy();
    }
  });

  it("is case insensitive", () => {
    const comp = analyzeGoal("DESIGN the SYSTEM ARCHITECTURE");
    expect(activeRoles(comp)).toContain("system_design");
  });
});
