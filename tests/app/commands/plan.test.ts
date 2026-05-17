import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSpecCommand } from "../../../src/app/commands/spec.js";
import { createPlanCommand } from "../../../src/app/commands/plan.js";
import { makeHarness } from "./spec-plan-shared.js";

function withTempDirs<T>(fn: (specsDir: string, plansDir: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "op-plan-cmd-"));
  return fn(join(root, "specs"), join(root, "plans")).finally(() => {
    rmSync(root, { recursive: true, force: true });
  });
}

describe("createPlanCommand", () => {
  it("errors when no spec is open", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const h = makeHarness(specsDir, plansDir);
      const cmd = createPlanCommand(h.makeDeps());
      await cmd.execute("", h.ctx);
      expect(h.messages.some((m) => m.role === "error" && m.content.includes("No spec"))).toBe(true);
      expect(h.appCtx.lastOpenedPlan).toBeNull();
    });
  });

  it("with an open spec, creates a plan linked to it and sets lastOpenedPlan", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const h = makeHarness(specsDir, plansDir);
      const specCmd = createSpecCommand(h.makeDeps());
      await specCmd.execute("user-auth", h.ctx);

      const planCmd = createPlanCommand(h.makeDeps());
      await planCmd.execute("", h.ctx);

      const planPath = join(plansDir, "user-auth.md");
      const file = readFileSync(planPath, "utf8");
      expect(file).toContain("slug: user-auth");
      expect(file).toContain("spec: ../specs/user-auth.md");
      expect(file).toContain("## Tasks");
      expect(h.appCtx.lastOpenedPlan).toEqual({ slug: "user-auth", path: planPath });
      expect(h.appCtx.lastOpenedKind).toBe("plan");
    });
  });

  it("with an explicit slug arg, uses that slug for the plan file", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const h = makeHarness(specsDir, plansDir);
      const specCmd = createSpecCommand(h.makeDeps());
      await specCmd.execute("user-auth", h.ctx);

      const planCmd = createPlanCommand(h.makeDeps());
      await planCmd.execute("oauth-only", h.ctx);

      expect(h.appCtx.lastOpenedPlan?.slug).toBe("oauth-only");
      expect(readFileSync(join(plansDir, "oauth-only.md"), "utf8")).toContain("slug: oauth-only");
    });
  });
});
