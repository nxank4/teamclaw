import { describe, it, expect } from "vitest";
import {
  AGENT_INCLUSION_RULES,
  scoreAgentInclusion,
  shouldIncludeAgent,
} from "@/agents/composition/rules.js";
import { REQUIRED_AGENTS } from "@/agents/composition/types.js";

describe("scoreAgentInclusion", () => {
  const sprintRule = AGENT_INCLUSION_RULES.find((r) => r.role === "sprint_planning")!;
  const designRule = AGENT_INCLUSION_RULES.find((r) => r.role === "system_design")!;

  it("scores positive keyword matches", () => {
    const result = scoreAgentInclusion(sprintRule, "plan a complex multi-step roadmap");
    expect(result.score).toBeGreaterThanOrEqual(3);
    expect(result.matchedKeywords).toContain("complex");
    expect(result.matchedKeywords).toContain("plan");
    expect(result.matchedKeywords).toContain("roadmap");
  });

  it("subtracts negative keyword hits", () => {
    const result = scoreAgentInclusion(sprintRule, "simple quick plan");
    // "plan" +1, "simple" -1, "quick" -1 => net -1
    expect(result.score).toBe(-1);
    expect(result.matchedKeywords).toEqual(["plan"]);
  });

  it("returns zero for unrelated goal", () => {
    const result = scoreAgentInclusion(designRule, "write a blog post about cats");
    expect(result.score).toBe(0);
    expect(result.matchedKeywords).toEqual([]);
  });

  it("matches partial keywords like 'scalab' in 'scalability'", () => {
    const result = scoreAgentInclusion(designRule, "scalability of the api");
    expect(result.matchedKeywords).toContain("scalab");
    expect(result.matchedKeywords).toContain("api");
  });
});

describe("shouldIncludeAgent", () => {
  const sprintRule = AGENT_INCLUSION_RULES.find((r) => r.role === "sprint_planning")!;
  const designRule = AGENT_INCLUSION_RULES.find((r) => r.role === "system_design")!;
  const postMortemRule = AGENT_INCLUSION_RULES.find((r) => r.role === "post_mortem")!;
  const retroRule = AGENT_INCLUSION_RULES.find((r) => r.role === "retrospective")!;

  it("includes agent when net score >= 1", () => {
    const result = shouldIncludeAgent(sprintRule, "plan a complex roadmap with multiple phases");
    expect(result.include).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("excludes agent when no keywords match", () => {
    const result = shouldIncludeAgent(designRule, "fix a typo in the readme");
    expect(result.include).toBe(false);
  });

  it("excludes agent when negative keywords dominate", () => {
    const result = shouldIncludeAgent(sprintRule, "simple quick single task");
    expect(result.include).toBe(false);
  });

  it("caps confidence at 0.95", () => {
    // Many keyword hits
    const result = shouldIncludeAgent(
      designRule,
      "architect and design the system infrastructure with database api microservice scalability component integration",
    );
    expect(result.include).toBe(true);
    expect(result.confidence).toBeLessThanOrEqual(0.95);
  });

  it("includes post_mortem only for multi-run sessions", () => {
    expect(shouldIncludeAgent(postMortemRule, "any goal", { runCount: 1 }).include).toBe(false);
    expect(shouldIncludeAgent(postMortemRule, "any goal", { runCount: 3 }).include).toBe(true);
  });

  it("includes retrospective only for multi-run sessions", () => {
    expect(shouldIncludeAgent(retroRule, "any goal").include).toBe(false);
    expect(shouldIncludeAgent(retroRule, "any goal", { runCount: 2 }).include).toBe(true);
  });

  it("defaults runCount to 1 for post-graph agents", () => {
    expect(shouldIncludeAgent(postMortemRule, "any goal").include).toBe(false);
    expect(shouldIncludeAgent(retroRule, "any goal").include).toBe(false);
  });
});

describe("AGENT_INCLUSION_RULES", () => {
  it("covers all bypassable graph agents", () => {
    const roles = AGENT_INCLUSION_RULES.map((r) => r.role);
    expect(roles).toContain("sprint_planning");
    expect(roles).toContain("system_design");
    expect(roles).toContain("rfc_phase");
  });

  it("covers post-graph agents", () => {
    const roles = AGENT_INCLUSION_RULES.map((r) => r.role);
    expect(roles).toContain("post_mortem");
    expect(roles).toContain("retrospective");
  });

  it("does not include required agents (they are always active)", () => {
    const ruleRoles = AGENT_INCLUSION_RULES.map((r) => r.role);
    for (const required of REQUIRED_AGENTS) {
      expect(ruleRoles).not.toContain(required);
    }
  });
});
