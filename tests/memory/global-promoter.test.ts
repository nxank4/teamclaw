import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@lancedb/lancedb", () => ({
  connect: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

import type { SuccessPattern } from "@/memory/success/types.js";
import { PromotionEngine } from "@/memory/global/promoter.js";

function makePattern(overrides: Partial<SuccessPattern> = {}): SuccessPattern {
  return {
    id: `pat-${Math.random().toString(36).slice(2)}`,
    sessionId: "session-1",
    taskDescription: "Test task",
    agentRole: "worker",
    approach: "Direct approach",
    resultSummary: "Success",
    confidence: 0.9,
    approvalType: "auto",
    reworkCount: 0,
    goalContext: "Test",
    tags: ["test"],
    createdAt: Date.now(),
    runIndex: 1,
    ...overrides,
  };
}

describe("PromotionEngine", () => {
  let mockGlobalManager: Record<string, unknown>;
  let mockGlobalPatternStore: Record<string, unknown>;
  let mockSessionStore: Record<string, unknown>;
  let mockQualityStore: Record<string, unknown>;
  let mockEmbedder: Record<string, unknown>;

  beforeEach(() => {
    mockGlobalPatternStore = {
      upsert: vi.fn().mockResolvedValue(true),
      delete: vi.fn().mockResolvedValue(true),
    };

    mockGlobalManager = {
      getPatternStore: vi.fn().mockReturnValue(mockGlobalPatternStore),
    };

    mockSessionStore = {
      getAll: vi.fn().mockResolvedValue([]),
    };

    mockQualityStore = {
      getQuality: vi.fn().mockResolvedValue(null),
    };

    mockEmbedder = {
      generate: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    };
  });

  it("should promote high-confidence auto-approved patterns", async () => {
    const goodPattern = makePattern({ confidence: 0.9, reworkCount: 0, approvalType: "auto" });
    (mockSessionStore.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([goodPattern]);

    const engine = new PromotionEngine(
      mockGlobalManager as never,
      mockSessionStore as never,
      mockQualityStore as never,
      mockEmbedder as never,
    );

    const result = await engine.autoPromote("session-1");
    expect(result.promoted).toHaveLength(1);
    expect(result.promoted[0]).toBe(goodPattern.id);
  });

  it("should skip patterns with reworkCount >= 2", async () => {
    const badPattern = makePattern({ confidence: 0.95, reworkCount: 2, approvalType: "auto" });
    (mockSessionStore.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([badPattern]);

    const engine = new PromotionEngine(
      mockGlobalManager as never,
      mockSessionStore as never,
      mockQualityStore as never,
      mockEmbedder as never,
    );

    const result = await engine.autoPromote("session-1");
    expect(result.promoted).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });

  it("should skip low-confidence patterns", async () => {
    const lowConf = makePattern({ confidence: 0.5, reworkCount: 0, approvalType: "auto" });
    (mockSessionStore.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([lowConf]);

    const engine = new PromotionEngine(
      mockGlobalManager as never,
      mockSessionStore as never,
      mockQualityStore as never,
      mockEmbedder as never,
    );

    const result = await engine.autoPromote("session-1");
    expect(result.promoted).toHaveLength(0);
  });

  it("should promote quality-based patterns (qualityScore >= 0.7 AND timesRetrieved >= 3)", async () => {
    const pattern = makePattern({ confidence: 0.7, reworkCount: 1, approvalType: "user" });
    (mockSessionStore.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([pattern]);
    (mockQualityStore.getQuality as ReturnType<typeof vi.fn>).mockResolvedValue({
      patternId: pattern.id,
      timesRetrieved: 5,
      timesResultedInHighConfidence: 4,
      qualityScore: 0.8,
    });

    const engine = new PromotionEngine(
      mockGlobalManager as never,
      mockSessionStore as never,
      mockQualityStore as never,
      mockEmbedder as never,
    );

    const result = await engine.autoPromote("session-1");
    expect(result.promoted).toHaveLength(1);
  });

  it("should allow manual promotion via promoteById", async () => {
    const pattern = makePattern({ confidence: 0.5 }); // Normally wouldn't auto-promote
    (mockSessionStore.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([pattern]);

    const engine = new PromotionEngine(
      mockGlobalManager as never,
      mockSessionStore as never,
      mockQualityStore as never,
      mockEmbedder as never,
    );

    const ok = await engine.promoteById(pattern.id);
    expect(ok).toBe(true);
    expect(mockGlobalPatternStore.upsert).toHaveBeenCalled();
  });

  it("should demote by deleting from global store", async () => {
    const engine = new PromotionEngine(
      mockGlobalManager as never,
      mockSessionStore as never,
      mockQualityStore as never,
      mockEmbedder as never,
    );

    const ok = await engine.demoteById("global-123");
    expect(ok).toBe(true);
    expect(mockGlobalPatternStore.delete).toHaveBeenCalledWith("global-123");
  });
});
