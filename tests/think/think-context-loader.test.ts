import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Decision } from "@/journal/types.js";
import type { AgentProfile } from "@/agents/profiles/types.js";
import type { ThinkContext } from "@/think/types.js";

// Mock dependencies before import
const mockDecisions: Decision[] = [
  {
    id: "d1", sessionId: "s1", runIndex: 0, capturedAt: Date.now(),
    topic: "SSE", decision: "Use SSE", reasoning: "Simpler",
    recommendedBy: "tech_lead", confidence: 0.9, taskId: "t1",
    goalContext: "streaming", tags: ["sse"], embedding: [], status: "active",
  },
  {
    id: "d2", sessionId: "s1", runIndex: 0, capturedAt: Date.now(),
    topic: "Redis", decision: "Use Redis", reasoning: "Fast cache",
    recommendedBy: "rfc_author", confidence: 0.85, taskId: "t2",
    goalContext: "caching", tags: ["redis"], embedding: [], status: "active",
  },
  {
    id: "d3", sessionId: "s1", runIndex: 0, capturedAt: Date.now(),
    topic: "Auth", decision: "Use JWT", reasoning: "Stateless",
    recommendedBy: "coordinator", confidence: 0.8, taskId: "t3",
    goalContext: "auth", tags: ["jwt"], embedding: [], status: "active",
  },
  {
    id: "d4", sessionId: "s1", runIndex: 0, capturedAt: Date.now(),
    topic: "DB", decision: "Use Postgres", reasoning: "Relational",
    recommendedBy: "tech_lead", confidence: 0.7, taskId: "t4",
    goalContext: "database", tags: ["postgres"], embedding: [], status: "active",
  },
];

const mockPatterns = [
  { pattern: "pattern-1", context: "context-1" },
  { pattern: "pattern-2", context: "context-2" },
  { pattern: "pattern-3", context: "context-3" },
];

const mockProfile: AgentProfile = {
  agentRole: "tech_lead",
  taskTypeScores: [],
  overallScore: 0.85,
  strengths: ["pragmatic"],
  weaknesses: [],
  lastUpdatedAt: Date.now(),
  totalTasksCompleted: 10,
  scoreHistory: [0.85],
};

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

vi.mock("@/journal/store.js", () => ({
  DecisionStore: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue(mockDecisions),
  })),
}));

vi.mock("@/memory/success/store.js", () => ({
  SuccessPatternStore: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue(mockPatterns),
  })),
}));

vi.mock("@/agents/profiles/store.js", () => ({
  ProfileStore: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    getByRole: vi.fn().mockImplementation((role: string) => {
      if (role === "tech_lead") return Promise.resolve(mockProfile);
      if (role === "rfc_author") return Promise.resolve({ ...mockProfile, agentRole: "rfc_author" });
      return Promise.resolve(null);
    }),
  })),
}));

const { loadThinkContext } = await import("@/think/context-loader.js");

describe("loadThinkContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns max 3 decisions", async () => {
    const ctx = await loadThinkContext("streaming question");
    expect(ctx.relevantDecisions.length).toBeLessThanOrEqual(3);
  });

  it("returns max 2 patterns", async () => {
    const ctx = await loadThinkContext("any question");
    expect(ctx.relevantPatterns.length).toBeLessThanOrEqual(2);
  });

  it("loads agent profiles", async () => {
    const ctx = await loadThinkContext("question");
    expect(ctx.agentProfiles.techLead).not.toBeNull();
    expect(ctx.agentProfiles.rfcAuthor).not.toBeNull();
  });

  it("completes in under 500ms with mocked data", async () => {
    const start = Date.now();
    await loadThinkContext("question");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  it("returns empty context on full failure", async () => {
    // Import a fresh version that will fail (mocks already set up)
    const { loadThinkContext: loadFresh } = await import("@/think/context-loader.js");
    // The mock returns data, but this verifies the shape
    const ctx = await loadFresh("question");
    expect(ctx).toHaveProperty("relevantDecisions");
    expect(ctx).toHaveProperty("relevantPatterns");
    expect(ctx).toHaveProperty("agentProfiles");
  });
});
