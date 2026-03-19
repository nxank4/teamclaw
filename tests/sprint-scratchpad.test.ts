import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/core/logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), plain: vi.fn(), success: vi.fn() },
  isDebugMode: () => false,
}));

const {
  mockToArray,
  mockLimit,
  mockWhere,
  mockVectorSearch,
  mockAdd,
  mockDelete,
  mockCountRows,
  mockQuery,
  mockTable,
  mockCreateTable,
  mockOpenTable,
  mockTableNames,
  mockConnect,
  mockGenerate,
} = vi.hoisted(() => {
  const mockToArray = vi.fn().mockResolvedValue([]);
  const mockWhere = vi.fn().mockReturnValue({ toArray: mockToArray, limit: vi.fn().mockReturnValue({ toArray: mockToArray }) });
  const mockLimit = vi.fn().mockReturnValue({ toArray: mockToArray, where: mockWhere });
  const mockVectorSearch = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: mockLimit }) });
  const mockAdd = vi.fn().mockResolvedValue(undefined);
  const mockDelete = vi.fn().mockResolvedValue(undefined);
  const mockCountRows = vi.fn().mockResolvedValue(0);
  const mockQuery = vi.fn().mockReturnValue({ where: mockWhere, toArray: mockToArray });
  const mockTable = {
    vectorSearch: mockVectorSearch,
    add: mockAdd,
    delete: mockDelete,
    countRows: mockCountRows,
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
    mockLimit,
    mockWhere,
    mockVectorSearch,
    mockAdd,
    mockDelete,
    mockCountRows,
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

import {
  SprintScratchpad,
  getSprintScratchpad,
  clearSprintScratchpad,
  clearAllScratchpads,
} from "../src/memory/sprint-scratchpad.js";
import { HttpEmbeddingFunction } from "../src/core/knowledge-base.js";

function makeDb() {
  return {
    createTable: mockCreateTable,
    openTable: mockOpenTable,
    tableNames: mockTableNames,
  } as never;
}

function makeEmbedder() {
  return new HttpEmbeddingFunction("http://localhost", "model", "");
}

describe("SprintScratchpad", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllScratchpads();
    mockTableNames.mockResolvedValue([]);
    mockToArray.mockResolvedValue([]);
    mockCountRows.mockResolvedValue(0);
    mockGenerate.mockResolvedValue([[0.1, 0.2, 0.3]]);
    mockOpenTable.mockResolvedValue(mockTable);
    mockCreateTable.mockResolvedValue(mockTable);
  });

  it("write() stores entry with correct sprintId", async () => {
    const pad = new SprintScratchpad(makeDb(), makeEmbedder(), "sprint-42");
    await pad.init();

    await pad.write({
      agentRole: "researcher",
      type: "discovery",
      content: "Found library X is 3x faster",
      tags: ["performance", "library"],
    });

    expect(mockCreateTable).toHaveBeenCalledWith(
      "sprint_scratchpad",
      expect.arrayContaining([
        expect.objectContaining({
          sprint_id: "sprint-42",
          agent_role: "researcher",
          type: "discovery",
          content: "Found library X is 3x faster",
        }),
      ]),
    );
  });

  it("write() returns entry with generated id and readBy", async () => {
    const pad = new SprintScratchpad(makeDb(), makeEmbedder(), "sprint-1");
    await pad.init();

    const entry = await pad.write({
      agentRole: "coder",
      type: "decision",
      content: "Use connection pooling",
      tags: ["db"],
    });

    expect(entry.id).toContain("sprint-1-");
    expect(entry.sprintId).toBe("sprint-1");
    expect(entry.readBy).toEqual(["coder"]);
    expect(entry.agentRole).toBe("coder");
  });

  it("write() uses add() when table already exists", async () => {
    mockTableNames.mockResolvedValue(["sprint_scratchpad"]);
    const pad = new SprintScratchpad(makeDb(), makeEmbedder(), "sprint-2");
    await pad.init();

    await pad.write({
      agentRole: "tester",
      type: "warning",
      content: "Edge case: empty array crashes validation",
      tags: ["bug"],
    });

    expect(mockAdd).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          sprint_id: "sprint-2",
          agent_role: "tester",
          type: "warning",
        }),
      ]),
    );
    expect(mockCreateTable).not.toHaveBeenCalled();
  });

  it("read() returns semantically similar entries", async () => {
    mockTableNames.mockResolvedValue(["sprint_scratchpad"]);
    mockCountRows.mockResolvedValue(3);
    const mockWhereInner = vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          {
            id: "sprint-1-123",
            sprint_id: "sprint-1",
            agent_role: "researcher",
            type: "discovery",
            content: "Library X is fast",
            tags_json: '["perf"]',
            read_by_json: '["researcher"]',
            timestamp: 1000,
          },
        ]),
      }),
    });
    mockVectorSearch.mockReturnValue({ where: mockWhereInner });

    const pad = new SprintScratchpad(makeDb(), makeEmbedder(), "sprint-1");
    await pad.init();

    const results = await pad.read("fast library", "coder");

    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("Library X is fast");
    expect(results[0].agentRole).toBe("researcher");
    expect(mockVectorSearch).toHaveBeenCalled();
  });

  it("read() with excludeOwn filters by agent_role in where clause", async () => {
    mockTableNames.mockResolvedValue(["sprint_scratchpad"]);
    mockCountRows.mockResolvedValue(2);
    const mockWhereInner = vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    });
    mockVectorSearch.mockReturnValue({ where: mockWhereInner });

    const pad = new SprintScratchpad(makeDb(), makeEmbedder(), "sprint-1");
    await pad.init();

    await pad.read("query", "researcher", { excludeOwn: true });

    expect(mockWhereInner).toHaveBeenCalledWith(
      expect.stringContaining("agent_role != 'researcher'"),
    );
  });

  it("read() returns empty for different sprintId (filtered by where clause)", async () => {
    mockTableNames.mockResolvedValue(["sprint_scratchpad"]);
    mockCountRows.mockResolvedValue(5);
    const mockWhereInner = vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    });
    mockVectorSearch.mockReturnValue({ where: mockWhereInner });

    const pad = new SprintScratchpad(makeDb(), makeEmbedder(), "sprint-99");
    await pad.init();

    const results = await pad.read("anything", "coder");

    expect(results).toEqual([]);
    expect(mockWhereInner).toHaveBeenCalledWith(
      expect.stringContaining("sprint_id = 'sprint-99'"),
    );
  });

  it("read() returns empty when table has no rows", async () => {
    mockTableNames.mockResolvedValue(["sprint_scratchpad"]);
    mockCountRows.mockResolvedValue(0);

    const pad = new SprintScratchpad(makeDb(), makeEmbedder(), "sprint-1");
    await pad.init();

    const results = await pad.read("query", "coder");
    expect(results).toEqual([]);
    expect(mockVectorSearch).not.toHaveBeenCalled();
  });

  it("getAll() returns all entries for sprint", async () => {
    mockTableNames.mockResolvedValue(["sprint_scratchpad"]);
    const mockQueryWhere = vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          id: "s1-1",
          sprint_id: "sprint-5",
          agent_role: "coder",
          type: "decision",
          content: "Use pooling",
          tags_json: "[]",
          read_by_json: '["coder"]',
          timestamp: 100,
        },
        {
          id: "s1-2",
          sprint_id: "sprint-5",
          agent_role: "tester",
          type: "warning",
          content: "Edge case found",
          tags_json: '["bug"]',
          read_by_json: '["tester","coder"]',
          timestamp: 200,
        },
      ]),
    });
    mockQuery.mockReturnValue({ where: mockQueryWhere });

    const pad = new SprintScratchpad(makeDb(), makeEmbedder(), "sprint-5");
    await pad.init();

    const all = await pad.getAll();

    expect(all).toHaveLength(2);
    expect(all[0].content).toBe("Use pooling");
    expect(all[1].readBy).toEqual(["tester", "coder"]);
  });

  it("getAll() returns empty when table not initialized", async () => {
    const pad = new SprintScratchpad(makeDb(), makeEmbedder(), "sprint-1");
    await pad.init();

    const all = await pad.getAll();
    expect(all).toEqual([]);
  });

  it("cleanup() removes entries older than specified days", async () => {
    mockTableNames.mockResolvedValue(["sprint_scratchpad"]);
    const pad = new SprintScratchpad(makeDb(), makeEmbedder(), "sprint-1");
    await pad.init();

    await pad.cleanup(7);

    expect(mockDelete).toHaveBeenCalledWith(
      expect.stringMatching(/^timestamp < \d+$/),
    );
  });
});

describe("getSprintScratchpad / clearSprintScratchpad", () => {
  beforeEach(() => {
    clearAllScratchpads();
  });

  it("getSprintScratchpad() returns same instance for same sprintId", () => {
    const db = makeDb();
    const embedder = makeEmbedder();
    const pad1 = getSprintScratchpad("sprint-A", db, embedder);
    const pad2 = getSprintScratchpad("sprint-A", db, embedder);

    expect(pad1).toBe(pad2);
  });

  it("getSprintScratchpad() returns different instances for different sprintIds", () => {
    const db = makeDb();
    const embedder = makeEmbedder();
    const pad1 = getSprintScratchpad("sprint-A", db, embedder);
    const pad2 = getSprintScratchpad("sprint-B", db, embedder);

    expect(pad1).not.toBe(pad2);
    expect(pad1.sprintId).toBe("sprint-A");
    expect(pad2.sprintId).toBe("sprint-B");
  });

  it("clearSprintScratchpad() removes from map", () => {
    const db = makeDb();
    const embedder = makeEmbedder();
    const pad1 = getSprintScratchpad("sprint-A", db, embedder);
    clearSprintScratchpad("sprint-A");
    const pad2 = getSprintScratchpad("sprint-A", db, embedder);

    expect(pad1).not.toBe(pad2);
  });
});
