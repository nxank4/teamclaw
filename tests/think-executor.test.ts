// tests/think-executor.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StreamChunk } from "../src/client/types.js";
import type { ThinkContext, ThinkRound } from "../src/think/types.js";

// Mock ProxyService
const mockStream = vi.fn();

vi.mock("../src/proxy/ProxyService.js", () => ({
  ProxyService: vi.fn().mockImplementation(() => ({
    stream: mockStream,
    ensureConnected: vi.fn().mockResolvedValue(undefined),
  })),
  createProxyService: vi.fn().mockReturnValue({
    stream: mockStream,
    ensureConnected: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../src/core/global-config.js", () => ({
  readGlobalConfigWithDefaults: () => ({
    gatewayUrl: "ws://localhost:18789",
    token: "test-token",
  }),
}));

const { executeThinkRound } = await import("../src/think/executor.js");

const emptyContext: ThinkContext = {
  relevantDecisions: [],
  relevantPatterns: [],
  agentProfiles: { techLead: null, rfcAuthor: null },
};

async function* makeChunks(text: string): AsyncGenerator<StreamChunk> {
  const words = text.split(" ");
  for (let i = 0; i < words.length; i++) {
    yield { content: words[i] + " ", done: i === words.length - 1 };
  }
}

describe("executeThinkRound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sequences Tech Lead → RFC Author → Coordinator", async () => {
    const techLeadText = "SSE is simpler for this use case.";
    const rfcAuthorText = "Consider WebSocket for future needs.";
    const coordinatorJson = JSON.stringify({
      choice: "Use SSE",
      confidence: 0.88,
      reasoning: "SSE fits the unidirectional requirement.",
      tradeoffs: { pros: ["Simple"], cons: ["No bidirectional"] },
    });

    let callCount = 0;
    mockStream.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeChunks(techLeadText);
      if (callCount === 2) return makeChunks(rfcAuthorText);
      return makeChunks(coordinatorJson);
    });

    const round = await executeThinkRound("SSE or WebSocket?", emptyContext);

    expect(mockStream).toHaveBeenCalledTimes(3);
    expect(round.techLeadPerspective).toContain("SSE is simpler");
    expect(round.rfcAuthorPerspective).toContain("WebSocket");
    expect(round.recommendation.choice).toBe("Use SSE");
    expect(round.recommendation.confidence).toBe(0.88);
  });

  it("returns partial results on RFC Author failure", async () => {
    const techLeadText = "SSE is simpler.";
    let callCount = 0;
    mockStream.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeChunks(techLeadText);
      throw new Error("Connection failed");
    });

    const round = await executeThinkRound("SSE or WebSocket?", emptyContext);

    expect(round.techLeadPerspective).toContain("SSE is simpler");
    expect(round.rfcAuthorPerspective).toBe("");
    expect(round.recommendation.choice).toBe("Inconclusive");
    expect(round.recommendation.confidence).toBe(0);
  });

  it("includes previous rounds in follow-up prompts", async () => {
    const prevRounds: ThinkRound[] = [{
      question: "SSE or WebSocket?",
      techLeadPerspective: "SSE is simpler.",
      rfcAuthorPerspective: "WebSocket for future.",
      recommendation: {
        choice: "Use SSE", confidence: 0.88,
        reasoning: "Fits requirement.", tradeoffs: { pros: ["Simple"], cons: ["No bidir"] },
      },
    }];

    const coordinatorJson = JSON.stringify({
      choice: "Keep SSE", confidence: 0.9,
      reasoning: "Still correct.", tradeoffs: { pros: ["Consistent"], cons: ["None"] },
    });

    mockStream.mockImplementation(() => makeChunks(coordinatorJson));

    await executeThinkRound("What about approvals?", emptyContext, {
      previousRounds: prevRounds,
      onChunk: () => {},
    });

    // Verify first call (Tech Lead) includes previous round context
    const firstCallPrompt = mockStream.mock.calls[0][0] as string;
    expect(firstCallPrompt).toContain("Previous discussion");
    expect(firstCallPrompt).toContain("SSE or WebSocket?");
  });
});
