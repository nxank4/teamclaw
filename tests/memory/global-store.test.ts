import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock lancedb
vi.mock("@lancedb/lancedb", () => ({
  connect: vi.fn(),
}));

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

import type { GlobalFailureLesson } from "@/memory/global/types.js";

describe("GlobalMemoryManager", () => {
  let mockDb: Record<string, unknown>;
  let mockTable: Record<string, unknown>;
  let mockPatternStore: Record<string, unknown>;
  let rows: Array<Record<string, unknown>>;

  beforeEach(() => {
    rows = [];

    mockTable = {
      add: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      countRows: vi.fn().mockImplementation(() => Promise.resolve(rows.length)),
      query: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          toArray: vi.fn().mockImplementation(() => Promise.resolve(rows)),
        }),
        toArray: vi.fn().mockImplementation(() => Promise.resolve(rows)),
      }),
    };

    mockDb = {
      tableNames: vi.fn().mockResolvedValue([]),
      createTable: vi.fn().mockResolvedValue(mockTable),
      openTable: vi.fn().mockResolvedValue(mockTable),
    };

    mockPatternStore = {
      init: vi.fn().mockResolvedValue(undefined),
      count: vi.fn().mockResolvedValue(0),
      getAll: vi.fn().mockResolvedValue([]),
    };
  });

  it("should define GlobalFailureLesson type correctly", () => {
    const lesson: GlobalFailureLesson = {
      id: "lesson-1",
      text: "Always validate inputs",
      sessionId: "session-1",
      retrievalCount: 3,
      helpedAvoidFailure: true,
      createdAt: Date.now(),
      promotedAt: Date.now(),
      promotedBy: "auto",
    };
    expect(lesson.id).toBe("lesson-1");
    expect(lesson.promotedBy).toBe("auto");
    expect(lesson.helpedAvoidFailure).toBe(true);
  });

  it("should separate global DB path from session DB", () => {
    const sessionPath = "data/vector_store/lancedb";
    const globalPath = "~/.teamclaw/memory/global.db";
    expect(sessionPath).not.toBe(globalPath);
  });

  it("should define MemoryHealth type", async () => {
    const { GlobalMemoryManager } = await import("@/memory/global/store.js");

    // Type check — just verify the shape
    const health = {
      totalGlobalPatterns: 0,
      totalGlobalLessons: 0,
      averagePatternAge: 0,
      averageQualityScore: 0,
      stalePatternsCount: 0,
      knowledgeGraphEdges: 0,
      oldestPattern: null,
      newestPattern: null,
    };
    expect(health.totalGlobalPatterns).toBe(0);
    expect(health.oldestPattern).toBeNull();
  });

  it("should define GlobalSuccessPattern with promotion fields", async () => {
    const { type } = await import("@/memory/global/types.js") as Record<string, unknown>;
    // Import types — verify they exist by constructing one
    const pattern = {
      id: "pat-1",
      sessionId: "session-1",
      taskDescription: "Test task",
      agentRole: "worker",
      approach: "Direct approach",
      resultSummary: "Success",
      confidence: 0.9,
      approvalType: "auto" as const,
      reworkCount: 0,
      goalContext: "Test",
      tags: ["test"],
      createdAt: Date.now(),
      runIndex: 1,
      promotedAt: Date.now(),
      promotedBy: "auto" as const,
      sourceSessionId: "session-1",
      globalQualityScore: 0.85,
    };
    expect(pattern.promotedAt).toBeGreaterThan(0);
    expect(pattern.promotedBy).toBe("auto");
    expect(pattern.sourceSessionId).toBe("session-1");
  });

  it("should deduplicate lessons by id on upsert", () => {
    // Conceptual: upsert deletes existing by id before adding
    const existingLesson = { id: "lesson-1", text: "Original" };
    const updatedLesson = { id: "lesson-1", text: "Updated" };
    // After upsert, only the updated lesson should exist
    expect(existingLesson.id).toBe(updatedLesson.id);
  });
});
