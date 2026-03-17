import { describe, it, expect } from "vitest";
import {
  buildTechLeadPrompt,
  buildRfcAuthorPrompt,
  buildCoordinatorPrompt,
  buildFollowUpContext,
} from "../src/think/prompts.js";
import type { ThinkRound, ThinkRecommendation } from "../src/think/types.js";
import type { Decision } from "../src/journal/types.js";

const fakeDecision: Decision = {
  id: "d1",
  sessionId: "s1",
  runIndex: 0,
  capturedAt: Date.now(),
  topic: "SSE streaming",
  decision: "Use SSE for agent streaming",
  reasoning: "Simpler than WebSocket for unidirectional flow",
  recommendedBy: "rfc_author",
  confidence: 0.91,
  taskId: "t1",
  goalContext: "agent streaming",
  tags: ["sse", "streaming"],
  embedding: [],
  status: "active",
};

const fakeRound: ThinkRound = {
  question: "SSE or WebSocket?",
  techLeadPerspective: "SSE is simpler.",
  rfcAuthorPerspective: "WebSocket for bidirectional.",
  recommendation: {
    choice: "Use SSE",
    confidence: 0.88,
    reasoning: "Simpler for unidirectional.",
    tradeoffs: { pros: ["Simple"], cons: ["No bidirectional"] },
  },
};

describe("buildTechLeadPrompt", () => {
  it("includes the question", () => {
    const prompt = buildTechLeadPrompt("SSE or WebSocket?", []);
    expect(prompt).toContain("SSE or WebSocket?");
  });

  it("includes decision context when provided", () => {
    const prompt = buildTechLeadPrompt("SSE or WebSocket?", [fakeDecision]);
    expect(prompt).toContain("Use SSE for agent streaming");
    expect(prompt).toContain("0.91");
  });

  it("says no past decisions when empty", () => {
    const prompt = buildTechLeadPrompt("SSE or WebSocket?", []);
    expect(prompt).toContain("No relevant past decisions");
  });
});

describe("buildRfcAuthorPrompt", () => {
  it("includes the question", () => {
    const prompt = buildRfcAuthorPrompt("SSE or WebSocket?", []);
    expect(prompt).toContain("SSE or WebSocket?");
  });

  it("includes decision context when provided", () => {
    const prompt = buildRfcAuthorPrompt("SSE or WebSocket?", [fakeDecision]);
    expect(prompt).toContain("Use SSE for agent streaming");
  });
});

describe("buildCoordinatorPrompt", () => {
  it("includes both perspectives", () => {
    const prompt = buildCoordinatorPrompt("SSE is simpler.", "WebSocket for bidirectional.");
    expect(prompt).toContain("SSE is simpler.");
    expect(prompt).toContain("WebSocket for bidirectional.");
  });

  it("requests JSON output", () => {
    const prompt = buildCoordinatorPrompt("a", "b");
    expect(prompt).toContain('"choice"');
    expect(prompt).toContain('"confidence"');
  });
});

describe("buildFollowUpContext", () => {
  it("includes previous rounds", () => {
    const context = buildFollowUpContext([fakeRound]);
    expect(context).toContain("SSE or WebSocket?");
    expect(context).toContain("SSE is simpler.");
    expect(context).toContain("WebSocket for bidirectional.");
    expect(context).toContain("Use SSE");
  });

  it("returns empty string for no rounds", () => {
    expect(buildFollowUpContext([])).toBe("");
  });
});
