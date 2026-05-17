import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createReviseCommand } from "../../../src/app/commands/revise.js";
import { makeHarness } from "./spec-plan-shared.js";

function withTempDirs<T>(fn: (s: string, p: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "op-revise-"));
  return fn(join(root, "specs"), join(root, "plans")).finally(() =>
    rmSync(root, { recursive: true, force: true }),
  );
}

describe("createReviseCommand", () => {
  it("errors when not in executing phase", async () => {
    await withTempDirs(async (s, p) => {
      const h = makeHarness(s, p);
      await createReviseCommand(h.makeDeps()).execute("", h.ctx);
      expect(h.messages.some((m) => m.role === "error" && m.content.includes("executing"))).toBe(true);
      expect(h.appCtx.pendingPhaseConfirmation).toBeNull();
    });
  });

  it("from executing: aborts router, rewinds to plan_drafting, points user at the plan file, sets pending plan confirmation", async () => {
    await withTempDirs(async (s, p) => {
      const h = makeHarness(s, p);
      const { mkdirSync } = await import("node:fs");
      mkdirSync(p, { recursive: true });
      // Pre-populate a plan file so the hint can name a real path.
      const planPath = join(p, "alpha.md");
      writeFileSync(planPath, [
        "---",
        "slug: alpha",
        "status: approved",
        "created: 2026-01-01T00:00:00Z",
        "last_updated: 2026-01-01T00:00:00Z",
        "---",
        "",
        "## Tasks",
        "",
        "- [ ] task one",
      ].join("\n"));

      // Drive the session into executing with the plan linked.
      h.session.setPhase("spec_required", "classifyComplex");
      h.session.setPhase("spec_drafting", "openSpec");
      h.session.setPhase("spec_approved", "approveSpec");
      h.session.setPhase("plan_drafting", "openPlan");
      h.session.setPhase("plan_approved", "approvePlan");
      h.session.setPhase("executing", "startExecute");
      h.session.setPlanPath(planPath);

      await createReviseCommand(h.makeDeps()).execute("", h.ctx);

      expect(h.routerAbortCalls).toHaveLength(1);
      expect(h.session.getPhase().currentPhase).toBe("plan_drafting");
      expect(h.appCtx.pendingPhaseConfirmation?.kind).toBe("plan");
      expect(h.appCtx.pendingPhaseConfirmation?.planPath).toBe(planPath);
      // The hint message names the plan path + tells the user to edit externally.
      expect(h.messages.some((m) => m.content.includes(planPath) && m.content.includes("editor"))).toBe(true);
    });
  });
});
