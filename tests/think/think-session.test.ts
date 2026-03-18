import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ThinkRecommendation, ThinkContext } from "@/think/types.js";
import { parseLlmJson } from "@/utils/jsonExtractor.js";

const mockRecommendation: ThinkRecommendation = {
  choice: "Use SSE",
  confidence: 0.88,
  reasoning: "Fits the use case.",
  tradeoffs: { pros: ["Simple"], cons: ["No bidirectional"] },
};

const mockContext: ThinkContext = {
  relevantDecisions: [],
  relevantPatterns: [],
  agentProfiles: { techLead: null, rfcAuthor: null },
};

vi.mock("@/think/context-loader.js", () => ({
  loadThinkContext: vi.fn().mockResolvedValue(mockContext),
}));

const mockExecuteThinkRound = vi.fn().mockResolvedValue({
  question: "SSE or WebSocket?",
  techLeadPerspective: "SSE is simpler.",
  rfcAuthorPerspective: "WebSocket for future.",
  recommendation: mockRecommendation,
});

vi.mock("@/think/executor.js", () => ({
  executeThinkRound: mockExecuteThinkRound,
}));

vi.mock("@/think/history.js", () => ({
  ThinkHistoryStore: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    record: vi.fn().mockResolvedValue(true),
  })),
}));

const mockUpsert = vi.fn().mockResolvedValue(undefined);
vi.mock("@/journal/store.js", () => ({
  DecisionStore: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    upsert: mockUpsert,
  })),
}));

vi.mock("@/core/knowledge-base.js", () => ({
  VectorMemory: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    getEmbedder: vi.fn().mockReturnValue({}),
  })),
}));

vi.mock("@/core/config.js", () => ({
  CONFIG: { vectorStorePath: "/tmp/test", memoryBackend: "lancedb" },
}));

vi.mock("@/memory/global/store.js", () => ({
  GlobalMemoryManager: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    getDb: vi.fn().mockReturnValue({}),
  })),
}));

const { createThinkSession, addFollowUp, saveToJournal } = await import(
  "@/think/session.js"
);

describe("createThinkSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteThinkRound.mockResolvedValue({
      question: "SSE or WebSocket?",
      techLeadPerspective: "SSE is simpler.",
      rfcAuthorPerspective: "WebSocket for future.",
      recommendation: mockRecommendation,
    });
  });

  it("creates a session with one round", async () => {
    const session = await createThinkSession("SSE or WebSocket?");
    expect(session.question).toBe("SSE or WebSocket?");
    expect(session.rounds.length).toBe(1);
    expect(session.recommendation).toEqual(mockRecommendation);
    expect(session.savedToJournal).toBe(false);
  });

  it("session.recommendation mirrors latest round", async () => {
    const session = await createThinkSession("SSE or WebSocket?");
    expect(session.recommendation).toBe(session.rounds[0].recommendation);
  });
});

describe("addFollowUp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteThinkRound.mockResolvedValue({
      question: "SSE or WebSocket?",
      techLeadPerspective: "SSE is simpler.",
      rfcAuthorPerspective: "WebSocket for future.",
      recommendation: mockRecommendation,
    });
  });

  it("adds a follow-up round", async () => {
    const session = await createThinkSession("SSE or WebSocket?");
    const updated = await addFollowUp(session, "What about approvals?");
    expect(updated.rounds.length).toBe(2);
    expect(updated.recommendation).toEqual(mockRecommendation);
  });

  it("enforces 3 follow-up cap", async () => {
    let session = await createThinkSession("Q1");
    session = await addFollowUp(session, "Q2");
    session = await addFollowUp(session, "Q3");
    session = await addFollowUp(session, "Q4");
    // 1 original + 3 follow-ups = 4 rounds max
    await expect(addFollowUp(session, "Q5")).rejects.toThrow(/maximum/i);
  });
});

describe("saveToJournal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue(undefined);
    mockExecuteThinkRound.mockResolvedValue({
      question: "SSE or WebSocket?",
      techLeadPerspective: "SSE is simpler.",
      rfcAuthorPerspective: "WebSocket for future.",
      recommendation: mockRecommendation,
    });
  });

  it("marks session as saved", async () => {
    const session = await createThinkSession("SSE or WebSocket?");
    const saved = await saveToJournal(session);
    expect(saved.savedToJournal).toBe(true);
  });

  it("maps recommendation directly to Decision with correct fields", async () => {
    const session = await createThinkSession("SSE or WebSocket?");
    await saveToJournal(session);

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const decision = mockUpsert.mock.calls[0][0];
    expect(decision.decision).toBe("Use SSE");
    expect(decision.recommendedBy).toBe("coordinator");
    expect(decision.confidence).toBe(0.88);
    expect(decision.goalContext).toBe("SSE or WebSocket?");
    expect(decision.runIndex).toBe(0);
    expect(decision.taskId).toBe("");
    expect(decision.status).toBe("active");
  });

  it("throws on inconclusive recommendation", async () => {
    mockExecuteThinkRound.mockResolvedValueOnce({
      question: "Q",
      techLeadPerspective: "",
      rfcAuthorPerspective: "",
      recommendation: {
        choice: "Inconclusive",
        confidence: 0,
        reasoning: "Failed.",
        tradeoffs: { pros: [], cons: [] },
      },
    });
    const session = await createThinkSession("Q");
    await expect(saveToJournal(session)).rejects.toThrow(/inconclusive/i);
  });
});

describe("sprint handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteThinkRound.mockResolvedValue({
      question: "SSE or WebSocket?",
      techLeadPerspective: "SSE is simpler.",
      rfcAuthorPerspective: "WebSocket for future.",
      recommendation: mockRecommendation,
    });
  });

  it("pre-populates goal from recommendation choice", async () => {
    const session = await createThinkSession("SSE or WebSocket?");
    const goal = `Implement: ${session.recommendation?.choice}`;
    expect(goal).toBe("Implement: Use SSE");
  });
});

// Test coordinator JSON parsing resilience.
// parseLlmJson handles fence-stripping and boundary extraction;
// extractFallbackRecommendation handles the total-failure case.
const { extractFallbackRecommendation } = await vi.importActual<
  typeof import("@/think/executor.js")
>("@/think/executor.js");

const validJson: ThinkRecommendation = {
  choice: "Use Redis",
  confidence: 0.85,
  reasoning: "Best for this use case.",
  tradeoffs: { pros: ["Fast"], cons: ["Complexity"] },
};

describe("coordinator JSON parsing", () => {
  it("parses JSON wrapped in ```json fences", () => {
    const input = "Here is my analysis:\n```json\n" + JSON.stringify(validJson) + "\n```\nHope this helps!";
    const result = parseLlmJson<ThinkRecommendation>(input);
    expect(result.choice).toBe("Use Redis");
    expect(result.confidence).toBe(0.85);
  });

  it("parses JSON wrapped in ``` fences", () => {
    const input = "```\n" + JSON.stringify(validJson) + "\n```";
    const result = parseLlmJson<ThinkRecommendation>(input);
    expect(result.choice).toBe("Use Redis");
  });

  it("parses JSON with prose before and after", () => {
    const input = "After careful analysis, I recommend:\n\n" + JSON.stringify(validJson) + "\n\nLet me know if you need more details.";
    const result = parseLlmJson<ThinkRecommendation>(input);
    expect(result.choice).toBe("Use Redis");
    expect(result.confidence).toBe(0.85);
  });

  it("returns text fallback for completely non-JSON response", () => {
    const raw = "I recommend using Redis for caching. It provides low latency and high throughput.";
    const result = extractFallbackRecommendation(raw);
    expect(result.choice).not.toBe("Inconclusive");
    expect(result.confidence).toBe(0.7);
    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(result.tradeoffs.pros).toContain("See full analysis");
  });

  it("returns text fallback for partial/truncated JSON", () => {
    const raw = '{"choice": "Use Redis", "confidence": 0.85, "reasoning": "Best for';
    const result = extractFallbackRecommendation(raw);
    expect(result.choice).not.toBe("Inconclusive");
    expect(result.confidence).toBe(0.7);
    expect(result.reasoning.length).toBeGreaterThan(0);
  });

  it("returns text fallback for empty response", () => {
    const result = extractFallbackRecommendation("");
    expect(result.choice).not.toBe("Inconclusive");
    expect(result.confidence).toBe(0.7);
    expect(result.reasoning).toContain("empty response");
  });

  it("extracts choice from 'Recommendation:' pattern in text", () => {
    const raw = "After weighing the options, here is my conclusion.\n\nRecommendation: Use SSE for real-time updates. It is simpler and more reliable for this use case.";
    const result = extractFallbackRecommendation(raw);
    expect(result.choice).toBe("Use SSE for real-time updates");
    expect(result.confidence).toBe(0.7);
  });
});
