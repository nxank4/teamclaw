import { describe, it, expect } from "vitest";
import { renderContextMarkdown } from "../src/handoff/renderer.js";
import type { HandoffData } from "../src/handoff/types.js";
import type { Decision } from "../src/journal/types.js";

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: "d1",
    sessionId: "sess_1",
    runIndex: 0,
    capturedAt: Date.now(),
    topic: "auth",
    decision: "Use JWT",
    reasoning: "Stateless auth is simpler",
    recommendedBy: "tech_lead",
    confidence: 0.9,
    taskId: "t1",
    goalContext: "Auth refactor",
    tags: ["auth"],
    embedding: [],
    status: "active",
    ...overrides,
  };
}

function makeHandoffData(overrides: Partial<HandoffData> = {}): HandoffData {
  return {
    generatedAt: Date.now(),
    sessionId: "sess_abc123",
    projectPath: "/home/user/myapp",
    completedGoal: "Refactor auth module",
    sessionStatus: "complete",
    currentState: ["OAuth2 with PKCE flow implemented"],
    activeDecisions: [makeDecision()],
    leftToDo: [
      { description: "Add rate limiting", type: "deferred", priority: "medium" },
    ],
    teamLearnings: ["PKCE flow preferred over implicit"],
    teamPerformance: [
      { agentRole: "Worker Bot", trend: "improving", avgConfidence: 0.85, note: "strong on implementation" },
    ],
    resumeCommands: ['teamclaw work --goal "Add rate limiting"'],
    ...overrides,
  };
}

describe("renderContextMarkdown", () => {
  it("produces valid CommonMark under 150 lines", () => {
    const md = renderContextMarkdown(makeHandoffData());
    const lines = md.split("\n");
    expect(lines.length).toBeLessThan(150);
  });

  it("contains all 6 required sections", () => {
    const md = renderContextMarkdown(makeHandoffData());
    expect(md).toContain("## Where We Are");
    expect(md).toContain("## Active Decisions");
    expect(md).toContain("## Left To Do");
    expect(md).toContain("## What The Team Learned");
    expect(md).toContain("## Team Performance");
    expect(md).toContain("## How To Resume");
  });

  it("includes generated timestamp", () => {
    const md = renderContextMarkdown(makeHandoffData());
    expect(md).toMatch(/\*\*Generated:\*\*/);
  });

  it("includes session ID and project path", () => {
    const md = renderContextMarkdown(makeHandoffData());
    expect(md).toContain("sess_abc123");
    expect(md).toContain("/home/user/myapp");
  });

  it("renders status emoji correctly for complete", () => {
    const md = renderContextMarkdown(makeHandoffData({ sessionStatus: "complete" }));
    expect(md).toContain("\u2705");
  });

  it("renders status emoji correctly for failed", () => {
    const md = renderContextMarkdown(makeHandoffData({ sessionStatus: "failed" }));
    expect(md).toContain("\u274C");
  });

  it("renders status emoji correctly for partial", () => {
    const md = renderContextMarkdown(makeHandoffData({ sessionStatus: "partial" }));
    expect(md).toContain("\u26A0\uFE0F");
  });

  it("renders decisions with numbering", () => {
    const md = renderContextMarkdown(makeHandoffData({
      activeDecisions: [
        makeDecision({ decision: "Use JWT" }),
        makeDecision({ id: "d2", decision: "Use Redis" }),
      ],
    }));
    expect(md).toMatch(/1\.\s+\*\*Use JWT\*\*/);
    expect(md).toMatch(/2\.\s+\*\*Use Redis\*\*/);
  });

  it("renders leftToDo as checkbox items", () => {
    const md = renderContextMarkdown(makeHandoffData());
    expect(md).toContain("- [ ] Add rate limiting");
  });

  it("renders resume commands as code", () => {
    const md = renderContextMarkdown(makeHandoffData());
    expect(md).toContain("```");
    expect(md).toContain('teamclaw work --goal "Add rate limiting"');
  });

  it("omits Team Performance section when no profiles", () => {
    const md = renderContextMarkdown(makeHandoffData({ teamPerformance: [] }));
    expect(md).not.toContain("## Team Performance");
  });

  it("omits What The Team Learned section when no learnings", () => {
    const md = renderContextMarkdown(makeHandoffData({ teamLearnings: [] }));
    expect(md).not.toContain("## What The Team Learned");
  });
});
