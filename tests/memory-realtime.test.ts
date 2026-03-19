import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/core/logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), plain: vi.fn(), success: vi.fn() },
  isDebugMode: () => false,
}));

const {
  mockToArray,
  mockAdd,
  mockDelete,
  mockQuery,
  mockTable,
  mockCreateTable,
  mockOpenTable,
  mockTableNames,
  mockConnect,
  mockGenerate,
} = vi.hoisted(() => {
  const mockToArray = vi.fn().mockResolvedValue([]);
  const mockWhere = vi.fn().mockReturnValue({ toArray: mockToArray });
  const mockQuery = vi.fn().mockReturnValue({ where: mockWhere, toArray: mockToArray });
  const mockAdd = vi.fn().mockResolvedValue(undefined);
  const mockDelete = vi.fn().mockResolvedValue(undefined);
  const mockTable = {
    add: mockAdd,
    delete: mockDelete,
    query: mockQuery,
  };
  const mockCreateTable = vi.fn().mockResolvedValue(mockTable);
  const mockOpenTable = vi.fn().mockResolvedValue(mockTable);
  const mockTableNames = vi.fn().mockResolvedValue([]);
  const mockConnect = vi.fn().mockResolvedValue({
    createTable: mockCreateTable,
    openTable: mockOpenTable,
    tableNames: mockTableNames,
  });
  const mockGenerate = vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]);

  return {
    mockToArray,
    mockAdd,
    mockDelete,
    mockQuery,
    mockTable,
    mockCreateTable,
    mockOpenTable,
    mockTableNames,
    mockConnect,
    mockGenerate,
  };
});

vi.mock("@lancedb/lancedb", () => ({
  connect: mockConnect,
}));

vi.mock("../src/core/knowledge-base.js", () => ({
  HttpEmbeddingFunction: vi.fn().mockImplementation(() => ({
    generate: mockGenerate,
  })),
}));

import { maybePromoteDiscovery, finalizeSprintMemories } from "../src/memory/realtime-promoter.js";
import { clearAllScratchpads } from "../src/memory/sprint-scratchpad.js";
import { HttpEmbeddingFunction } from "../src/core/knowledge-base.js";
import type { ScratchpadEntry } from "../src/memory/sprint-scratchpad.js";

function makeGlobalManager() {
  return {
    getDb: vi.fn().mockReturnValue({
      tableNames: mockTableNames,
      createTable: mockCreateTable,
      openTable: mockOpenTable,
    }),
    getPatternStore: vi.fn().mockReturnValue(null),
    init: vi.fn(),
  } as never;
}

function makeEmbedder() {
  return new HttpEmbeddingFunction("http://localhost", "model", "");
}

function makeEntry(overrides: Partial<ScratchpadEntry> = {}): ScratchpadEntry {
  return {
    id: "sprint-1-abc",
    sprintId: "sprint-1",
    agentRole: "researcher",
    type: "decision",
    content: "Use connection pooling for DB access",
    tags: ["db", "performance"],
    timestamp: Date.now(),
    readBy: ["researcher", "coder"],
    ...overrides,
  };
}

describe("maybePromoteDiscovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllScratchpads();
    mockTableNames.mockResolvedValue([]);
    mockToArray.mockResolvedValue([]);
    mockGenerate.mockResolvedValue([[0.1, 0.2, 0.3]]);
    mockCreateTable.mockResolvedValue(mockTable);
    mockOpenTable.mockResolvedValue(mockTable);
  });

  it("promotes when corroborated by 2+ agents and high-signal type", async () => {
    const entry = makeEntry({
      type: "decision",
      readBy: ["researcher", "coder"],
    });

    const result = await maybePromoteDiscovery(entry, makeGlobalManager(), makeEmbedder());

    expect(result).toBe(true);
    expect(mockCreateTable).toHaveBeenCalledWith(
      "provisional_memories",
      expect.arrayContaining([
        expect.objectContaining({
          id: entry.id,
          sprint_id: entry.sprintId,
          content: entry.content,
          confidence: 0.7,
          provisional: 1,
        }),
      ]),
    );
  });

  it("promotes warning type entries when corroborated", async () => {
    const entry = makeEntry({
      type: "warning",
      readBy: ["debugger", "tester", "coder"],
    });

    const result = await maybePromoteDiscovery(entry, makeGlobalManager(), makeEmbedder());
    expect(result).toBe(true);
  });

  it("skips non-corroborated entries (readBy < 2)", async () => {
    const entry = makeEntry({
      readBy: ["researcher"], // only 1 reader
    });

    const result = await maybePromoteDiscovery(entry, makeGlobalManager(), makeEmbedder());

    expect(result).toBe(false);
    expect(mockCreateTable).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("skips low-signal types (discovery, artifact)", async () => {
    const discoveryEntry = makeEntry({
      type: "discovery",
      readBy: ["researcher", "coder"],
    });
    const result1 = await maybePromoteDiscovery(discoveryEntry, makeGlobalManager(), makeEmbedder());
    expect(result1).toBe(false);

    const artifactEntry = makeEntry({
      type: "artifact",
      readBy: ["researcher", "coder"],
    });
    const result2 = await maybePromoteDiscovery(artifactEntry, makeGlobalManager(), makeEmbedder());
    expect(result2).toBe(false);
  });

  it("skips when already promoted (existing row in provisional table)", async () => {
    mockTableNames.mockResolvedValue(["provisional_memories"]);
    const mockQueryWhere = vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ id: "sprint-1-abc" }]),
    });
    mockQuery.mockReturnValue({ where: mockQueryWhere });

    const entry = makeEntry();
    const result = await maybePromoteDiscovery(entry, makeGlobalManager(), makeEmbedder());

    expect(result).toBe(false);
  });

  it("returns false when globalManager has no db", async () => {
    const mgr = {
      getDb: vi.fn().mockReturnValue(null),
      getPatternStore: vi.fn().mockReturnValue(null),
    } as never;

    const entry = makeEntry();
    const result = await maybePromoteDiscovery(entry, mgr, makeEmbedder());
    expect(result).toBe(false);
  });

  it("uses add() when provisional_memories table already exists", async () => {
    // First call: table doesn't exist → creates
    mockTableNames.mockResolvedValue([]);
    const entry1 = makeEntry({ id: "first" });
    await maybePromoteDiscovery(entry1, makeGlobalManager(), makeEmbedder());
    expect(mockCreateTable).toHaveBeenCalled();

    vi.clearAllMocks();

    // Second call: table exists → uses add
    mockTableNames.mockResolvedValue(["provisional_memories"]);
    mockToArray.mockResolvedValue([]); // no existing row
    const mockQueryWhere = vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });
    mockQuery.mockReturnValue({ where: mockQueryWhere });

    const entry2 = makeEntry({ id: "second" });
    await maybePromoteDiscovery(entry2, makeGlobalManager(), makeEmbedder());

    expect(mockAdd).toHaveBeenCalled();
    expect(mockCreateTable).not.toHaveBeenCalled();
  });
});

describe("finalizeSprintMemories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllScratchpads();
    mockTableNames.mockResolvedValue(["provisional_memories"]);
    mockToArray.mockResolvedValue([]);
    mockOpenTable.mockResolvedValue(mockTable);
  });

  it("confirms provisional memories on success (bumps confidence)", async () => {
    const mockQueryWhere = vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        { id: "sprint-1-abc", sprint_id: "sprint-1", content: "Use pooling", confidence: 0.7, provisional: 1, vector: [0.1] },
        { id: "sprint-1-def", sprint_id: "sprint-1", content: "Cache results", confidence: 0.7, provisional: 1, vector: [0.2] },
      ]),
    });
    mockQuery.mockReturnValue({ where: mockQueryWhere });

    const result = await finalizeSprintMemories(
      "sprint-1",
      true,
      makeGlobalManager(),
      null,
    );

    expect(result.confirmed).toBe(2);
    expect(result.removed).toBe(0);
    // Should delete then re-add with confidence 0.9
    expect(mockDelete).toHaveBeenCalledTimes(2);
    expect(mockAdd).toHaveBeenCalledTimes(2);
    expect(mockAdd).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ confidence: 0.9, provisional: 0 }),
      ]),
    );
  });

  it("removes provisional memories on failure", async () => {
    const mockQueryWhere = vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        { id: "sprint-2-abc", sprint_id: "sprint-2", content: "Bad pattern", confidence: 0.7, provisional: 1 },
      ]),
    });
    mockQuery.mockReturnValue({ where: mockQueryWhere });

    const result = await finalizeSprintMemories(
      "sprint-2",
      false,
      makeGlobalManager(),
      null,
    );

    expect(result.removed).toBe(1);
    expect(result.confirmed).toBe(0);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("calls clearSprintScratchpad (via import side effect)", async () => {
    const mockQueryWhere = vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });
    mockQuery.mockReturnValue({ where: mockQueryWhere });

    // Just verify it doesn't throw and returns cleanly
    const result = await finalizeSprintMemories(
      "sprint-3",
      true,
      makeGlobalManager(),
      null,
    );

    expect(result.confirmed).toBe(0);
    expect(result.removed).toBe(0);
  });

  it("returns zeros when no provisional table exists", async () => {
    mockTableNames.mockResolvedValue([]);

    const result = await finalizeSprintMemories(
      "sprint-4",
      true,
      makeGlobalManager(),
      null,
    );

    expect(result).toEqual({ confirmed: 0, removed: 0 });
  });

  it("returns zeros when globalManager has no db", async () => {
    const mgr = {
      getDb: vi.fn().mockReturnValue(null),
    } as never;

    const result = await finalizeSprintMemories("sprint-5", true, mgr, null);
    expect(result).toEqual({ confirmed: 0, removed: 0 });
  });

  it("handles empty provisional rows gracefully", async () => {
    const mockQueryWhere = vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });
    mockQuery.mockReturnValue({ where: mockQueryWhere });

    const result = await finalizeSprintMemories(
      "sprint-6",
      false,
      makeGlobalManager(),
      null,
    );

    expect(result).toEqual({ confirmed: 0, removed: 0 });
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
