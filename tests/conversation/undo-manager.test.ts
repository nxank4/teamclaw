import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { UndoManager } from "../../src/conversation/undo-manager.js";

describe("UndoManager", () => {
  let tmpDir: string;
  let snapshotsDir: string;
  let manager: UndoManager;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "openpawl-undo-test-"));
    snapshotsDir = path.join(tmpDir, "snapshots");
    manager = new UndoManager(snapshotsDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("snapshot creates copy before modification", async () => {
    const filePath = path.join(tmpDir, "original.txt");
    await writeFile(filePath, "original content");

    const result = await manager.snapshot(filePath, "coder");
    expect(result.isOk()).toBe(true);
  });

  it("undo restores from snapshot", async () => {
    const filePath = path.join(tmpDir, "test.txt");
    await writeFile(filePath, "before");
    await manager.snapshot(filePath, "coder");
    await writeFile(filePath, "after agent edit");

    const result = await manager.undo();
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().action).toBe("restored");

    const content = await readFile(filePath, "utf-8");
    expect(content).toBe("before");
  });

  it("undo deletes created-by-agent file", async () => {
    const filePath = path.join(tmpDir, "new-file.txt");
    // File doesn't exist yet → snapshot records as "created"
    await manager.snapshot(filePath, "coder");
    await writeFile(filePath, "agent created this");

    const result = await manager.undo();
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().action).toBe("deleted");
    expect(existsSync(filePath)).toBe(false);
  });

  it("getUndoStack returns in reverse chronological order", async () => {
    await writeFile(path.join(tmpDir, "a.txt"), "a");
    await writeFile(path.join(tmpDir, "b.txt"), "b");
    await manager.snapshot(path.join(tmpDir, "a.txt"), "coder");
    await manager.snapshot(path.join(tmpDir, "b.txt"), "coder");

    const stack = manager.getUndoStack();
    expect(stack).toHaveLength(2);
    expect(stack[0]!.filePath).toContain("b.txt");
  });

  it("undo with no modifications returns error", async () => {
    const result = await manager.undo();
    expect(result.isErr()).toBe(true);
  });
});
