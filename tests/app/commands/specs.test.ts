import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSpecCommand } from "../../../src/app/commands/spec.js";
import { createSpecsCommand } from "../../../src/app/commands/specs.js";
import { createPlanCommand } from "../../../src/app/commands/plan.js";
import { createPlansCommand } from "../../../src/app/commands/plans.js";
import { makeHarness } from "./spec-plan-shared.js";

function withTempDirs<T>(fn: (specsDir: string, plansDir: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "op-list-"));
  return fn(join(root, "specs"), join(root, "plans")).finally(() => {
    rmSync(root, { recursive: true, force: true });
  });
}

describe("createSpecsCommand / createPlansCommand", () => {
  it("/specs reports 'No specs found' when the directory is empty", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const h = makeHarness(specsDir, plansDir);
      const cmd = createSpecsCommand(h.makeDeps());
      await cmd.execute("", h.ctx);
      expect(h.messages.some((m) => m.content.includes("No specs found"))).toBe(true);
    });
  });

  it("/specs lists slug + status after creation", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const h = makeHarness(specsDir, plansDir);
      await createSpecCommand(h.makeDeps()).execute("alpha", h.ctx);
      await createSpecCommand(h.makeDeps()).execute("beta", h.ctx);
      const before = h.messages.length;
      await createSpecsCommand(h.makeDeps()).execute("", h.ctx);
      const list = h.messages.slice(before).map((m) => m.content).join("\n");
      expect(list).toContain("alpha");
      expect(list).toContain("beta");
      expect(list).toContain("draft");
    });
  });

  it("/plans reports 'No plans found' when the directory is empty", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const h = makeHarness(specsDir, plansDir);
      const cmd = createPlansCommand(h.makeDeps());
      await cmd.execute("", h.ctx);
      expect(h.messages.some((m) => m.content.includes("No plans found"))).toBe(true);
    });
  });

  it("/plans lists linked spec paths", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const h = makeHarness(specsDir, plansDir);
      await createSpecCommand(h.makeDeps()).execute("alpha", h.ctx);
      await createPlanCommand(h.makeDeps()).execute("", h.ctx);
      const before = h.messages.length;
      await createPlansCommand(h.makeDeps()).execute("", h.ctx);
      const list = h.messages.slice(before).map((m) => m.content).join("\n");
      expect(list).toContain("alpha");
      expect(list).toContain("spec:../specs/alpha.md");
    });
  });
});
