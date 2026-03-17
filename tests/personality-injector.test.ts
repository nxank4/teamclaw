import { describe, it, expect } from "vitest";
import { withPersonality } from "../src/personality/injector.js";
import type { PersonalityContext, PersonalityEvent } from "../src/personality/types.js";

const BASE_PROMPT = "You are a tech lead.\n\nEvaluate this code change.";

describe("withPersonality", () => {
  it("appends personality block for known role", () => {
    const result = withPersonality(BASE_PROMPT, "tech-lead");
    expect(result).toContain("## Your Character");
    expect(result).toContain("tech-lead");
    expect(result).toContain("pragmatic");
  });

  it("returns prompt unchanged for unknown role", () => {
    const result = withPersonality(BASE_PROMPT, "unknown-agent");
    expect(result).toBe(BASE_PROMPT);
  });

  it("preserves original prompt verbatim", () => {
    const result = withPersonality(BASE_PROMPT, "tech-lead");
    expect(result).toContain("You are a tech lead.");
    expect(result).toContain("Evaluate this code change.");
  });

  it("inserts after first paragraph break", () => {
    const result = withPersonality(BASE_PROMPT, "tech-lead");
    const parts = result.split("\n\n");
    expect(parts[0]).toBe("You are a tech lead.");
    expect(parts[1]).toContain("## Your Character");
  });

  it("appends at end when no paragraph break exists", () => {
    const singleLine = "Evaluate this code.";
    const result = withPersonality(singleLine, "tech-lead");
    expect(result).toContain(singleLine);
    expect(result).toContain("## Your Character");
  });

  it("includes recent events from context (max 2)", () => {
    const events: PersonalityEvent[] = [
      { id: "1", agentRole: "tech-lead", eventType: "pushback", sessionId: "s1", content: "Event one", createdAt: 1 },
      { id: "2", agentRole: "tech-lead", eventType: "opinion", sessionId: "s1", content: "Event two", createdAt: 2 },
      { id: "3", agentRole: "tech-lead", eventType: "pushback", sessionId: "s1", content: "Event three", createdAt: 3 },
    ];
    const context: PersonalityContext = { recentEvents: events };
    const result = withPersonality(BASE_PROMPT, "tech-lead", context);
    expect(result).toContain("Previously: Event one");
    expect(result).toContain("Previously: Event two");
    expect(result).not.toContain("Previously: Event three");
  });

  it("includes decision journal entry from context", () => {
    const context: PersonalityContext = {
      recentEvents: [],
      decisionJournalEntries: [{
        id: "d1",
        sessionId: "s1",
        runIndex: 0,
        capturedAt: Date.now(),
        topic: "Architecture",
        decision: "Use microservices",
        reasoning: "Scale better",
        recommendedBy: "tech-lead",
        confidence: 0.9,
        taskId: "t1",
        goalContext: "",
        tags: [],
        embedding: [],
        status: "active",
      }],
    };
    const result = withPersonality(BASE_PROMPT, "tech-lead", context);
    expect(result).toContain("Reference past decision: Architecture");
  });

  it("includes degrading trend note", () => {
    const context: PersonalityContext = {
      recentEvents: [],
      agentProfileTrend: "degrading",
    };
    const result = withPersonality(BASE_PROMPT, "tech-lead", context);
    expect(result).toContain("be more careful and thorough");
  });

  it("added text is under 150 words", () => {
    const result = withPersonality(BASE_PROMPT, "tech-lead");
    const added = result.replace(BASE_PROMPT, "");
    const wordCount = added.trim().split(/\s+/).length;
    expect(wordCount).toBeLessThan(150);
  });
});
