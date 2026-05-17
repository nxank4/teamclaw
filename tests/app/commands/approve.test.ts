import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createApproveCommand } from "../../../src/app/commands/approve.js";
import { createSpecCommand } from "../../../src/app/commands/spec.js";
import { createPlanCommand } from "../../../src/app/commands/plan.js";
import { loadSpecFromFile } from "../../../src/spec/loader.js";
import { loadPlanFromFile } from "../../../src/plans/loader.js";
import { writeSpec } from "../../../src/spec/writer.js";
import { makeHarness } from "./spec-plan-shared.js";

function withTempDirs<T>(fn: (specsDir: string, plansDir: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "op-approve-"));
  return fn(join(root, "specs"), join(root, "plans")).finally(() => {
    rmSync(root, { recursive: true, force: true });
  });
}

describe("createApproveCommand", () => {
  it("errors when nothing is currently open", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const h = makeHarness(specsDir, plansDir);
      const cmd = createApproveCommand(h.makeDeps());
      await cmd.execute("", h.ctx);
      expect(h.messages.some((m) => m.role === "error" && m.content.includes("Nothing to approve"))).toBe(true);
    });
  });

  it("flips an open spec from draft to approved", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const h = makeHarness(specsDir, plansDir);
      const specCmd = createSpecCommand(h.makeDeps());
      await specCmd.execute("alpha", h.ctx);

      const approveCmd = createApproveCommand(h.makeDeps());
      await approveCmd.execute("", h.ctx);

      const doc = await loadSpecFromFile(h.appCtx.lastOpenedSpec!.path);
      expect(doc.frontmatter.status).toBe("approved");
    });
  });

  it("flips the most-recently-opened plan from draft to approved", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const h = makeHarness(specsDir, plansDir);
      await createSpecCommand(h.makeDeps()).execute("alpha", h.ctx);
      await createPlanCommand(h.makeDeps()).execute("", h.ctx);

      // lastOpenedKind is now "plan" — /approve should flip the plan.
      await createApproveCommand(h.makeDeps()).execute("", h.ctx);

      const planDoc = await loadPlanFromFile(h.appCtx.lastOpenedPlan!.path);
      expect(planDoc.frontmatter.status).toBe("approved");
      const specDoc = await loadSpecFromFile(h.appCtx.lastOpenedSpec!.path);
      expect(specDoc.frontmatter.status).toBe("draft");
    });
  });

  it("errors when the target is already approved", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const h = makeHarness(specsDir, plansDir);
      await createSpecCommand(h.makeDeps()).execute("alpha", h.ctx);
      // Pre-flip to approved via the writer.
      const doc = await loadSpecFromFile(h.appCtx.lastOpenedSpec!.path);
      await writeSpec({ ...doc, frontmatter: { ...doc.frontmatter, status: "approved" } });

      const before = h.messages.length;
      await createApproveCommand(h.makeDeps()).execute("", h.ctx);
      const newMessages = h.messages.slice(before);
      expect(newMessages.some((m) => m.role === "error" && m.content.includes("not 'draft'"))).toBe(true);
    });
  });
});
