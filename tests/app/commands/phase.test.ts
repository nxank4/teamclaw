import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPhaseCommand } from "../../../src/app/commands/phase.js";
import { makeHarness } from "./spec-plan-shared.js";

function withTempDirs<T>(fn: (s: string, p: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "op-phase-"));
  return fn(join(root, "specs"), join(root, "plans")).finally(() =>
    rmSync(root, { recursive: true, force: true }),
  );
}

describe("createPhaseCommand", () => {
  it("emits the current phase and an empty history block when fresh", async () => {
    await withTempDirs(async (s, p) => {
      const h = makeHarness(s, p);
      await createPhaseCommand(h.makeDeps()).execute("", h.ctx);
      const out = h.messages.map((m) => m.content).join("\n");
      expect(out).toContain("Session phase: idle");
      expect(out).toContain("spec: —");
      expect(out).toContain("plan: —");
    });
  });

  it("emits the transition history when present", async () => {
    await withTempDirs(async (s, p) => {
      const h = makeHarness(s, p);
      h.session.setPhase("spec_required", "classifyComplex");
      h.session.setPhase("spec_drafting", "openSpec");
      h.session.setSpecPath("/tmp/spec.md");
      await createPhaseCommand(h.makeDeps()).execute("", h.ctx);
      const out = h.messages.map((m) => m.content).join("\n");
      expect(out).toContain("Session phase: spec_drafting");
      expect(out).toContain("spec: /tmp/spec.md");
      expect(out).toContain("classifyComplex");
      expect(out).toContain("openSpec");
    });
  });
});
