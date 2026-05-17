import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSpecCommand } from "../../../src/app/commands/spec.js";
import { makeHarness } from "./spec-plan-shared.js";

function withTempDirs<T>(fn: (specsDir: string, plansDir: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "op-spec-cmd-"));
  return fn(join(root, "specs"), join(root, "plans")).finally(() => {
    rmSync(root, { recursive: true, force: true });
  });
}

describe("createSpecCommand", () => {
  it("with no args and no open spec, emits a usage hint", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const h = makeHarness(specsDir, plansDir);
      const cmd = createSpecCommand(h.makeDeps());
      await cmd.execute("", h.ctx);
      expect(h.messages.some((m) => m.content.includes("Usage: /spec"))).toBe(true);
      expect(h.editorCalls).toHaveLength(0);
    });
  });

  it("with a valid slug, creates the spec file + opens the editor + records lastOpenedSpec", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const h = makeHarness(specsDir, plansDir);
      const cmd = createSpecCommand(h.makeDeps());
      await cmd.execute("user-auth", h.ctx);
      const path = join(specsDir, "user-auth.md");
      const file = readFileSync(path, "utf8");
      expect(file).toContain("slug: user-auth");
      expect(file).toContain("## Summary");
      expect(h.editorCalls).toHaveLength(1);
      expect(h.editorCalls[0]?.path).toBe(path);
      expect(h.appCtx.lastOpenedSpec).toEqual({ slug: "user-auth", path });
      expect(h.appCtx.lastOpenedKind).toBe("spec");
    });
  });

  it("with a slug for an existing spec, opens without recreating", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const h = makeHarness(specsDir, plansDir);
      const cmd = createSpecCommand(h.makeDeps());
      await cmd.execute("billing", h.ctx);
      const path = join(specsDir, "billing.md");
      const firstBytes = readFileSync(path, "utf8");
      await cmd.execute("billing", h.ctx);
      const secondBytes = readFileSync(path, "utf8");
      expect(secondBytes).toBe(firstBytes);
      expect(h.editorCalls).toHaveLength(2);
    });
  });

  it("rejects an invalid slug", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const h = makeHarness(specsDir, plansDir);
      const cmd = createSpecCommand(h.makeDeps());
      await cmd.execute("Bad_Slug!", h.ctx);
      expect(h.messages.some((m) => m.role === "error" && m.content.includes("Invalid slug"))).toBe(true);
      expect(h.editorCalls).toHaveLength(0);
    });
  });
});
