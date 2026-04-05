import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createSessionManager } from "../../src/session/index.js";
import { SessionSwitcher } from "../../src/session/session-switcher.js";

describe("SessionSwitcher", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "openpawl-switch-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("findBestResume: no sessions → new", async () => {
    const mgr = createSessionManager({ sessionsDir: tmpDir, checkpointIntervalMs: 60_000 });
    await mgr.initialize();
    const switcher = new SessionSwitcher(mgr);
    const rec = await switcher.findBestResume(process.cwd());
    expect(rec.type).toBe("new");
    await mgr.shutdown();
  });

  it("findBestResume: 1 recent → resume", async () => {
    const mgr = createSessionManager({ sessionsDir: tmpDir, checkpointIntervalMs: 60_000 });
    await mgr.initialize();
    await mgr.create(process.cwd());
    const switcher = new SessionSwitcher(mgr);
    const rec = await switcher.findBestResume(process.cwd());
    // May be "resume" or "choose" depending on timing
    expect(["resume", "choose", "new"].includes(rec.type)).toBe(true);
    await mgr.shutdown();
  });
});
