import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { PromptHistoryStore } from "../../src/session/prompt-history-store.js";

describe("PromptHistoryStore", () => {
  let tmpDir: string;
  let store: PromptHistoryStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "openpawl-hist-test-"));
    store = new PromptHistoryStore(path.join(tmpDir, "history.json"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("add stores prompt", async () => {
    await store.add("fix the bug");
    expect(store.getAll()).toHaveLength(1);
    expect(store.getAll()[0]).toBe("fix the bug");
  });

  it("getAll returns most recent first", async () => {
    await store.add("first");
    await store.add("second");
    expect(store.getAll()[0]).toBe("second");
  });

  it("deduplicates consecutive identical prompts", async () => {
    await store.add("same prompt");
    await store.add("same prompt");
    expect(store.getAll()).toHaveLength(1);
  });

  it("does not store slash commands", async () => {
    await store.add("/help");
    await store.add("/model list");
    expect(store.getAll()).toHaveLength(0);
  });

  it("search filters by query", async () => {
    await store.add("fix authentication bug");
    await store.add("write tests for user model");
    expect(store.search("auth")).toHaveLength(1);
  });

  it("clear removes all entries", async () => {
    await store.add("test");
    await store.clear();
    expect(store.getAll()).toHaveLength(0);
  });
});
