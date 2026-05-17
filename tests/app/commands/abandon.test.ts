import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createAbandonCommand } from "../../../src/app/commands/abandon.js";
import { createSpecCommand } from "../../../src/app/commands/spec.js";
import { loadSpecFromFile } from "../../../src/spec/loader.js";
import { makeHarness } from "./spec-plan-shared.js";

function withTempDirs<T>(fn: (s: string, p: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "op-abandon-"));
  return fn(join(root, "specs"), join(root, "plans")).finally(() =>
    rmSync(root, { recursive: true, force: true }),
  );
}

describe("createAbandonCommand", () => {
  it("errors when already in a terminal phase", async () => {
    await withTempDirs(async (s, p) => {
      const h = makeHarness(s, p);
      // Force-set terminal phase via the test stub.
      h.session.setPhase("done", "finish");
      await createAbandonCommand(h.makeDeps()).execute("", h.ctx);
      expect(h.messages.some((m) => m.role === "error" && m.content.includes("terminal"))).toBe(true);
    });
  });

  it("transitions non-terminal phase to abandoned and flips spec frontmatter", async () => {
    await withTempDirs(async (s, p) => {
      const h = makeHarness(s, p);
      // Drive the session to spec_drafting via the test stub directly
      // (the /spec command doesn't currently transition the machine).
      await createSpecCommand(h.makeDeps()).execute("alpha", h.ctx);
      h.session.setPhase("spec_required", "classifyComplex");
      h.session.setPhase("spec_drafting", "openSpec");
      h.session.setSpecPath(h.appCtx.lastOpenedSpec!.path);

      await createAbandonCommand(h.makeDeps()).execute("", h.ctx);

      expect(h.session.getPhase().currentPhase).toBe("abandoned");
      const doc = await loadSpecFromFile(h.appCtx.lastOpenedSpec!.path);
      expect(doc.frontmatter.status).toBe("abandoned");
      expect(h.appCtx.pendingPhaseConfirmation).toBeNull();
    });
  });

  it("from idle (no artefacts), transitions to abandoned without errors", async () => {
    await withTempDirs(async (s, p) => {
      const h = makeHarness(s, p);
      await createAbandonCommand(h.makeDeps()).execute("", h.ctx);
      expect(h.session.getPhase().currentPhase).toBe("abandoned");
    });
  });
});
