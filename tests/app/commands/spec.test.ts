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
      expect(h.appCtx.lastOpenedSpec).toBeNull();
    });
  });

  it("with a valid slug, drafts the spec file + records lastOpenedSpec", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const h = makeHarness(specsDir, plansDir);
      const cmd = createSpecCommand(h.makeDeps());
      await cmd.execute("user-auth", h.ctx);
      const path = join(specsDir, "user-auth.md");
      const file = readFileSync(path, "utf8");
      expect(file).toContain("slug: user-auth");
      expect(file).toContain("## Summary");
      expect(h.appCtx.lastOpenedSpec).toEqual({ slug: "user-auth", path });
      expect(h.appCtx.lastOpenedKind).toBe("spec");
      // The system message tells the user where to find the file + how to proceed.
      expect(h.messages.some((m) => m.content.includes(path) && m.content.includes("editor"))).toBe(true);
    });
  });

  it("with a slug for an existing spec, registers without recreating", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const h = makeHarness(specsDir, plansDir);
      const cmd = createSpecCommand(h.makeDeps());
      await cmd.execute("billing", h.ctx);
      const path = join(specsDir, "billing.md");
      const firstBytes = readFileSync(path, "utf8");
      await cmd.execute("billing", h.ctx);
      const secondBytes = readFileSync(path, "utf8");
      expect(secondBytes).toBe(firstBytes);
      // Both invocations register the same file as active.
      expect(h.appCtx.lastOpenedSpec?.path).toBe(path);
    });
  });

  it("rejects an invalid slug", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const h = makeHarness(specsDir, plansDir);
      const cmd = createSpecCommand(h.makeDeps());
      await cmd.execute("Bad_Slug!", h.ctx);
      expect(h.messages.some((m) => m.role === "error" && m.content.includes("Invalid slug"))).toBe(true);
      expect(h.appCtx.lastOpenedSpec).toBeNull();
    });
  });
});
