import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  readSessionIndex,
  writeSessionIndex,
  addSessionToIndex,
  tagSession,
  untagSession,
  pruneOldSessions,
  deleteAllSessions,
} from "@/replay/storage.js";
import type { SessionIndexEntry } from "@/replay/types.js";

const TEST_HOME = path.join(os.tmpdir(), "openpawl-replay-test-" + Date.now());

// Override the sessions dir for testing
vi.mock("node:os", async () => {
  const actual = await vi.importActual("node:os");
  return {
    ...actual,
    homedir: () => TEST_HOME,
  };
});

function makeEntry(sessionId: string, createdAt: number, tag?: string): SessionIndexEntry {
  return {
    sessionId,
    goal: `Goal for ${sessionId}`,
    createdAt,
    completedAt: createdAt + 60000,
    totalRuns: 1,
    totalCostUSD: 0.1,
    averageConfidence: 0.85,
    recordingPath: "",
    recordingSizeBytes: 100,
    teamComposition: ["software_engineer"],
    ...(tag ? { tag } : {}),
  };
}

describe("replay storage", () => {
  beforeEach(() => {
    mkdirSync(path.join(TEST_HOME, ".openpawl", "sessions"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_HOME)) {
      rmSync(TEST_HOME, { recursive: true, force: true });
    }
  });

  it("reads empty index when file does not exist", () => {
    const entries = readSessionIndex();
    expect(entries).toEqual([]);
  });

  it("writes and reads index entries", () => {
    const entries = [makeEntry("sess-1", 1000), makeEntry("sess-2", 2000)];
    writeSessionIndex(entries);
    const read = readSessionIndex();
    expect(read).toHaveLength(2);
    expect(read[0].sessionId).toBe("sess-1");
  });

  it("adds entries without duplicates", () => {
    addSessionToIndex(makeEntry("sess-1", 1000));
    addSessionToIndex(makeEntry("sess-2", 2000));
    addSessionToIndex(makeEntry("sess-1", 3000)); // update

    const entries = readSessionIndex();
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.sessionId === "sess-1")?.createdAt).toBe(3000);
  });

  it("tags and untags sessions", () => {
    addSessionToIndex(makeEntry("sess-1", 1000));

    tagSession("sess-1", "important");
    let entries = readSessionIndex();
    expect(entries[0].tag).toBe("important");

    untagSession("sess-1");
    entries = readSessionIndex();
    expect(entries[0].tag).toBeUndefined();
  });

  it("prunes oldest untagged sessions when over limit", () => {
    // Default max is 20 — add 22 sessions, tag one old one
    const entries: SessionIndexEntry[] = [];
    entries.push(makeEntry("tagged-old", 1000, "keep"));
    for (let i = 1; i <= 21; i++) {
      entries.push(makeEntry(`sess-${i}`, 1000 + i * 1000));
    }
    writeSessionIndex(entries);

    const { pruned } = pruneOldSessions();

    // Should prune 2 oldest untagged to get from 22 to 20
    expect(pruned).toHaveLength(2);
    expect(pruned).toContain("sess-1");
    expect(pruned).toContain("sess-2");
    expect(pruned).not.toContain("tagged-old"); // tagged, never pruned

    const remaining = readSessionIndex();
    expect(remaining).toHaveLength(20);
    expect(remaining.find((e) => e.sessionId === "tagged-old")).toBeDefined();
  });

  it("never prunes tagged sessions even when over limit", () => {
    // Create 25 sessions, all tagged — over the default limit of 20
    const entries: SessionIndexEntry[] = [];
    for (let i = 0; i < 25; i++) {
      entries.push(makeEntry(`tagged-${i}`, 1000 + i * 1000, `tag-${i}`));
    }
    writeSessionIndex(entries);

    const { pruned } = pruneOldSessions();

    // All tagged — nothing to prune even though over limit
    expect(pruned).toHaveLength(0);
    expect(readSessionIndex()).toHaveLength(25);
  });

  it("deletes all sessions", () => {
    writeSessionIndex([
      makeEntry("sess-1", 1000),
      makeEntry("sess-2", 2000),
    ]);

    const count = deleteAllSessions();
    expect(count).toBe(0); // No dirs to delete (just index entries)
    expect(readSessionIndex()).toHaveLength(0);
  });
});
