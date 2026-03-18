import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock lancedb
vi.mock("@lancedb/lancedb", () => ({
  connect: vi.fn(),
}));

import { ProfileStore } from "@/agents/profiles/store.js";
import type { AgentProfile } from "@/agents/profiles/types.js";

function makeProfile(role: string, overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    agentRole: role,
    taskTypeScores: [],
    overallScore: 0.75,
    strengths: ["implement"],
    weaknesses: [],
    lastUpdatedAt: Date.now(),
    totalTasksCompleted: 10,
    scoreHistory: [0.7, 0.75],
    ...overrides,
  };
}

describe("ProfileStore", () => {
  let store: ProfileStore;
  let mockDb: Record<string, unknown>;
  let mockTable: Record<string, unknown>;
  let rows: Array<Record<string, unknown>>;

  beforeEach(() => {
    rows = [];

    mockTable = {
      add: vi.fn().mockImplementation((newRows: Array<Record<string, unknown>>) => {
        rows.push(...newRows);
        return Promise.resolve(undefined);
      }),
      delete: vi.fn().mockImplementation((filter: string) => {
        const match = filter.match(/role = '(.+)'/);
        if (match) {
          rows = rows.filter((r) => String(r.role) !== match[1]);
        }
        return Promise.resolve(undefined);
      }),
      query: vi.fn().mockReturnValue({
        toArray: vi.fn().mockImplementation(() => Promise.resolve([...rows])),
      }),
    };

    mockDb = {
      tableNames: vi.fn().mockResolvedValue([]),
      createTable: vi.fn().mockImplementation((_name: string, initialRows: Array<Record<string, unknown>>) => {
        rows.push(...initialRows);
        return Promise.resolve(mockTable);
      }),
      openTable: vi.fn().mockResolvedValue(mockTable),
    };

    store = new ProfileStore();
  });

  it("creates table on first upsert", async () => {
    await store.init(mockDb as never);
    const profile = makeProfile("software_engineer");
    const ok = await store.upsert(profile);
    expect(ok).toBe(true);
    expect(mockDb.createTable).toHaveBeenCalledWith("agent_profiles", expect.any(Array));
  });

  it("deletes then adds on subsequent upsert", async () => {
    (mockDb.tableNames as ReturnType<typeof vi.fn>).mockResolvedValue(["agent_profiles"]);
    await store.init(mockDb as never);
    const profile = makeProfile("software_engineer");
    await store.upsert(profile);
    expect(mockTable.delete).toHaveBeenCalled();
    expect(mockTable.add).toHaveBeenCalled();
  });

  it("returns null for missing role", async () => {
    (mockDb.tableNames as ReturnType<typeof vi.fn>).mockResolvedValue(["agent_profiles"]);
    await store.init(mockDb as never);
    const result = await store.getByRole("nonexistent");
    expect(result).toBeNull();
  });

  it("returns correct profile for existing role", async () => {
    await store.init(mockDb as never);
    const profile = makeProfile("qa_reviewer", {
      overallScore: 0.85,
      strengths: ["audit", "test"],
      totalTasksCompleted: 20,
    });
    await store.upsert(profile);

    const retrieved = await store.getByRole("qa_reviewer");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.agentRole).toBe("qa_reviewer");
    expect(retrieved!.overallScore).toBe(0.85);
    expect(retrieved!.strengths).toEqual(["audit", "test"]);
    expect(retrieved!.totalTasksCompleted).toBe(20);
  });

  it("getAll deserializes all profiles correctly", async () => {
    await store.init(mockDb as never);
    await store.upsert(makeProfile("software_engineer"));
    await store.upsert(makeProfile("qa_reviewer"));

    const all = await store.getAll();
    expect(all).toHaveLength(2);
    const roles = all.map((p) => p.agentRole);
    expect(roles).toContain("software_engineer");
    expect(roles).toContain("qa_reviewer");
  });

  it("returns empty array when not initialized", async () => {
    const uninitStore = new ProfileStore();
    const result = await uninitStore.getAll();
    expect(result).toEqual([]);
  });

  it("delete removes a profile by role", async () => {
    (mockDb.tableNames as ReturnType<typeof vi.fn>).mockResolvedValue(["agent_profiles"]);
    await store.init(mockDb as never);
    rows.push({
      role: "software_engineer",
      task_type_scores: "[]",
      overall_score: 0.5,
      strengths: "[]",
      weaknesses: "[]",
      last_updated_at: Date.now(),
      total_tasks_completed: 5,
      score_history: "[]",
      vector: [0],
    });

    const ok = await store.delete("software_engineer");
    expect(ok).toBe(true);
    expect(mockTable.delete).toHaveBeenCalled();
  });
});
