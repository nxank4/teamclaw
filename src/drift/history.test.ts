import { describe, it, expect, beforeEach, vi } from "vitest";
import { DriftHistoryStore } from "./history.js";
import type { DriftHistoryEntry } from "./types.js";

const mockRows: Record<string, unknown>[] = [];
const mockTable = {
  query: () => ({
    toArray: async () => [...mockRows],
  }),
  add: vi.fn().mockImplementation(async (rows: Record<string, unknown>[]) => {
    mockRows.push(...rows);
  }),
};
const mockDb = {
  tableNames: vi.fn().mockResolvedValue(["drift_history"]),
  openTable: vi.fn().mockResolvedValue(mockTable),
  createTable: vi.fn().mockImplementation(async (_name: string, rows: Record<string, unknown>[]) => {
    mockRows.push(...rows);
    return mockTable;
  }),
};

function makeEntry(overrides: Partial<DriftHistoryEntry> = {}): DriftHistoryEntry {
  return {
    sessionId: "sess-123",
    goalText: "Add Redis caching",
    conflicts: [],
    resolution: "proceed",
    reconsidered: [],
    detectedAt: Date.now(),
    ...overrides,
  };
}

describe("DriftHistoryStore", () => {
  let store: DriftHistoryStore;

  beforeEach(async () => {
    mockRows.length = 0;
    vi.clearAllMocks();
    store = new DriftHistoryStore();
    await store.init(mockDb as unknown as import("@lancedb/lancedb").Connection);
  });

  it("records a drift history entry", async () => {
    const entry = makeEntry();
    const ok = await store.record(entry);
    expect(ok).toBe(true);
    expect(mockRows.length).toBeGreaterThan(0);
  });

  it("correctly stores resolution and reconsidered decisions", async () => {
    const entry = makeEntry({
      resolution: "reconsider",
      reconsidered: ["dec-1", "dec-2"],
    });
    await store.record(entry);

    const row = mockRows[mockRows.length - 1]!;
    expect(row.resolution).toBe("reconsider");
    const reconsidered = JSON.parse(String(row.reconsidered_json));
    expect(reconsidered).toEqual(["dec-1", "dec-2"]);
  });

  it("retrieves entries sorted by date", async () => {
    mockRows.push(
      {
        id: "d1", session_id: "s1", goal_text: "G1",
        conflicts_json: "[]", resolution: "proceed",
        reconsidered_json: "[]", detected_at: 100, vector: [0],
      },
      {
        id: "d2", session_id: "s2", goal_text: "G2",
        conflicts_json: "[]", resolution: "abort",
        reconsidered_json: "[]", detected_at: 200, vector: [0],
      },
    );

    const all = await store.getAll();
    expect(all).toHaveLength(2);
    expect(all[0]!.detectedAt).toBe(200); // newest first
  });

  it("filters by session", async () => {
    mockRows.push(
      {
        id: "d1", session_id: "sess-A", goal_text: "G1",
        conflicts_json: "[]", resolution: "proceed",
        reconsidered_json: "[]", detected_at: 100, vector: [0],
      },
      {
        id: "d2", session_id: "sess-B", goal_text: "G2",
        conflicts_json: "[]", resolution: "abort",
        reconsidered_json: "[]", detected_at: 200, vector: [0],
      },
    );

    const results = await store.getBySession("sess-A");
    expect(results).toHaveLength(1);
    expect(results[0]!.sessionId).toBe("sess-A");
  });
});
