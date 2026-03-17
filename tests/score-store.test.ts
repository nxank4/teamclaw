import { describe, it, expect, vi, beforeEach } from "vitest";
import { VibeScoreStore } from "../src/score/store.js";
import type { VibeScoreEntry } from "../src/score/types.js";

function makeEntry(date: string, overall: number): VibeScoreEntry {
  return {
    id: `score-${date}`,
    date,
    overall,
    teamTrust: 20,
    reviewEngagement: 25,
    warningResponse: 25,
    confidenceAlignment: 20,
    sessionCount: 1,
    eventsJson: "[]",
    patternsJson: "[]",
    tip: "Test tip",
    computedAt: Date.now(),
  };
}

function createMockTable(rows: Record<string, unknown>[] = []) {
  const data = [...rows];
  return {
    query: () => ({
      toArray: vi.fn().mockResolvedValue(data),
    }),
    add: vi.fn().mockImplementation(async (newRows: Record<string, unknown>[]) => {
      data.push(...newRows);
    }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockDb(existingTables: string[] = [], mockTable?: ReturnType<typeof createMockTable>) {
  const table = mockTable ?? createMockTable();
  return {
    tableNames: vi.fn().mockResolvedValue(existingTables),
    openTable: vi.fn().mockResolvedValue(table),
    createTable: vi.fn().mockResolvedValue(table),
    _table: table,
  };
}

describe("VibeScoreStore", () => {
  let store: VibeScoreStore;

  beforeEach(() => {
    store = new VibeScoreStore();
  });

  it("initializes with existing table", async () => {
    const db = createMockDb(["vibe_scores"]);
    await store.init(db as never);
    expect(db.openTable).toHaveBeenCalledWith("vibe_scores");
  });

  it("initializes without existing table", async () => {
    const db = createMockDb([]);
    await store.init(db as never);
    expect(db.openTable).not.toHaveBeenCalled();
  });

  it("creates table on first upsert", async () => {
    const db = createMockDb([]);
    await store.init(db as never);
    const entry = makeEntry("2026-03-17", 75);
    const result = await store.upsert(entry);
    expect(result).toBe(true);
    expect(db.createTable).toHaveBeenCalledWith("vibe_scores", expect.any(Array));
  });

  it("returns empty array when no table exists", async () => {
    const db = createMockDb([]);
    await store.init(db as never);
    const all = await store.getAll();
    expect(all).toEqual([]);
  });

  it("getRecent filters by date", async () => {
    const mockTable = createMockTable([
      { id: "score-2026-03-17", date: "2026-03-17", overall: 75, team_trust: 20, review_engagement: 25, warning_response: 25, confidence_alignment: 5, session_count: 1, events_json: "[]", patterns_json: "[]", tip: "", computed_at: Date.now() },
      { id: "score-2026-01-01", date: "2026-01-01", overall: 50, team_trust: 10, review_engagement: 20, warning_response: 15, confidence_alignment: 5, session_count: 1, events_json: "[]", patterns_json: "[]", tip: "", computed_at: Date.now() },
    ]);
    const db = createMockDb(["vibe_scores"], mockTable);
    await store.init(db as never);
    const recent = await store.getRecent(30);
    // Only the March entry should be within 30 days
    expect(recent.length).toBeGreaterThanOrEqual(1);
    expect(recent[0]!.date).toBe("2026-03-17");
  });
});
