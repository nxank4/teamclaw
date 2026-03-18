import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ThinkHistoryEntry } from "@/think/types.js";

// Mock LanceDB
const mockRows: Record<string, unknown>[] = [];
const mockTable = {
  add: vi.fn().mockImplementation(async (rows: Record<string, unknown>[]) => {
    mockRows.push(...rows);
  }),
  query: vi.fn().mockReturnValue({
    toArray: vi.fn().mockImplementation(async () => [...mockRows]),
  }),
};

const mockDb = {
  tableNames: vi.fn().mockResolvedValue([]),
  createTable: vi.fn().mockImplementation(async (_name: string, rows: Record<string, unknown>[]) => {
    mockRows.push(...rows);
    return mockTable;
  }),
  openTable: vi.fn().mockResolvedValue(mockTable),
};

const { ThinkHistoryStore } = await import("@/think/history.js");

describe("ThinkHistoryStore", () => {
  let store: InstanceType<typeof ThinkHistoryStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRows.length = 0;
    store = new ThinkHistoryStore();
  });

  it("records and retrieves entries", async () => {
    await store.init(mockDb as any);

    const entry: ThinkHistoryEntry = {
      sessionId: "think-123",
      question: "SSE or WebSocket?",
      recommendation: "Use SSE",
      confidence: 0.88,
      savedToJournal: true,
      followUpCount: 1,
      createdAt: Date.now(),
    };

    const ok = await store.record(entry);
    expect(ok).toBe(true);

    const all = await store.getAll();
    expect(all.length).toBe(1);
    expect(all[0].question).toBe("SSE or WebSocket?");
    expect(all[0].savedToJournal).toBe(true);
  });

  it("returns empty array when no table exists", async () => {
    await store.init(mockDb as any);
    // Don't record anything — table created lazily
    const freshStore = new ThinkHistoryStore();
    mockDb.tableNames.mockResolvedValueOnce([]);
    await freshStore.init(mockDb as any);
    const all = await freshStore.getAll();
    expect(all).toEqual([]);
  });

  it("sorts by createdAt descending", async () => {
    await store.init(mockDb as any);

    await store.record({
      sessionId: "t1", question: "First", recommendation: "A",
      confidence: 0.5, savedToJournal: false, followUpCount: 0, createdAt: 1000,
    });
    await store.record({
      sessionId: "t2", question: "Second", recommendation: "B",
      confidence: 0.7, savedToJournal: true, followUpCount: 1, createdAt: 2000,
    });

    const all = await store.getAll();
    expect(all[0].question).toBe("Second");
    expect(all[1].question).toBe("First");
  });
});
