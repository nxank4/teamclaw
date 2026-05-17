import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createApproveCommand } from "../../../src/app/commands/approve.js";
import { loadPlanFromFile } from "../../../src/plans/loader.js";
import { loadSpecFromFile } from "../../../src/spec/loader.js";
import { makeHarness } from "./spec-plan-shared.js";

function withTempDirs<T>(fn: (s: string, p: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "op-approve-pa-"));
  return fn(join(root, "specs"), join(root, "plans")).finally(() =>
    rmSync(root, { recursive: true, force: true }),
  );
}

function specBody(slug: string): string {
  return [
    "---",
    `slug: ${slug}`,
    "status: draft",
    "created: 2026-01-01T00:00:00Z",
    "last_updated: 2026-01-01T00:00:00Z",
    "---",
    "",
    "# Body",
  ].join("\n");
}

function planBody(slug: string): string {
  return [
    "---",
    `slug: ${slug}`,
    "status: draft",
    "created: 2026-01-01T00:00:00Z",
    "last_updated: 2026-01-01T00:00:00Z",
    "---",
    "",
    "## Tasks",
    "- [ ] x",
  ].join("\n");
}

describe("createApproveCommand — phase-aware", () => {
  it("from spec_drafting: flips spec to approved, creates plan, opens plan editor", async () => {
    await withTempDirs(async (s, p) => {
      const h = makeHarness(s, p);
      // Seed a spec file on disk + put the session in spec_drafting.
      const { mkdirSync } = await import("node:fs");
      mkdirSync(s, { recursive: true });
      const specPath = join(s, "alpha.md");
      writeFileSync(specPath, specBody("alpha"));
      h.session.setPhase("spec_required", "classifyComplex");
      h.session.setPhase("spec_drafting", "openSpec");
      h.session.setSpecPath(specPath);

      await createApproveCommand(h.makeDeps()).execute("", h.ctx);

      const spec = await loadSpecFromFile(specPath);
      expect(spec.frontmatter.status).toBe("approved");
      expect(h.session.getPhase().currentPhase).toBe("plan_drafting");
      expect(h.editorCalls).toHaveLength(1);
      const planPath = h.editorCalls[0]?.path ?? "";
      expect(planPath).toContain("/plans/alpha.md");
      expect(h.appCtx.pendingPhaseConfirmation?.kind).toBe("plan");
    });
  });

  it("from plan_drafting: flips plan to approved, transitions to executing", async () => {
    await withTempDirs(async (s, p) => {
      const h = makeHarness(s, p);
      const { mkdirSync } = await import("node:fs");
      mkdirSync(p, { recursive: true });
      const planPath = join(p, "alpha.md");
      writeFileSync(planPath, planBody("alpha"));
      h.session.setPhase("spec_required", "classifyComplex");
      h.session.setPhase("spec_drafting", "openSpec");
      h.session.setPhase("spec_approved", "approveSpec");
      h.session.setPhase("plan_drafting", "openPlan");
      h.session.setPlanPath(planPath);

      await createApproveCommand(h.makeDeps()).execute("", h.ctx);

      const plan = await loadPlanFromFile(planPath);
      expect(plan.frontmatter.status).toBe("approved");
      expect(h.session.getPhase().currentPhase).toBe("executing");
    });
  });

  it("from idle with lastOpenedSpec set: legacy frontmatter flip (no plan creation)", async () => {
    await withTempDirs(async (s, p) => {
      const h = makeHarness(s, p);
      // Mimic PR #177 behaviour: spec opened manually, no phase machine driven.
      const { mkdirSync } = await import("node:fs");
      mkdirSync(s, { recursive: true });
      const specPath = join(s, "alpha.md");
      writeFileSync(specPath, specBody("alpha"));
      h.appCtx.lastOpenedSpec = { slug: "alpha", path: specPath };
      h.appCtx.lastOpenedKind = "spec";

      await createApproveCommand(h.makeDeps()).execute("", h.ctx);

      const spec = await loadSpecFromFile(specPath);
      expect(spec.frontmatter.status).toBe("approved");
      // Legacy path doesn't transition or create a plan.
      expect(h.session.getPhase().currentPhase).toBe("idle");
      expect(h.editorCalls).toHaveLength(0);
    });
  });
});
