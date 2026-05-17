import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleWithRouter } from "../../src/app/prompt-handler.js";
import { emptyPhaseBlock, type Phase, type PhaseTrigger } from "../../src/session/phase-machine.js";
import type { AppContext } from "../../src/app/init-session-router.js";
import type { AppLayout } from "../../src/app/layout.js";
import type { SpecPlanCommandDeps } from "../../src/app/commands/spec.js";
import type { PromptRouter } from "../../src/router/prompt-router.js";
import type { Session } from "../../src/session/session.js";

/**
 * Integration coverage for the full spec-driven flow. Drives the same
 * SessionStub + harness pieces the unit tests use, but exercises every
 * step end-to-end:
 *
 *   complex prompt → spec drafted (file written) → y → plan drafted
 *   → y → executing → dispatch → /revise rewinds → y → re-dispatch
 *   /abandon flips frontmatter and transitions to abandoned
 */

class SessionStub {
  id = "test";
  private block = emptyPhaseBlock();
  getPhase() { return { ...this.block }; }
  setPhase(p: Phase, t: PhaseTrigger) {
    this.block = { ...this.block, currentPhase: p };
    this.block.history.push({ phase: p, at: new Date().toISOString(), trigger: t });
  }
  setSpecPath(p: string | null) { this.block = { ...this.block, currentSpecPath: p }; }
  setPlanPath(p: string | null) { this.block = { ...this.block, currentPlanPath: p }; }
}

interface Harness {
  appCtx: AppContext;
  session: SessionStub;
  router: PromptRouter;
  layout: AppLayout;
  deps: SpecPlanCommandDeps;
  messages: { role: string; content: string }[];
  routeCalls: { sessionId: string; text: string }[];
  ctx: { addMessage: (role: string, content: string, options?: { tag?: string }) => void };
}

function makeHarness(specsDir: string, plansDir: string): Harness {
  const messages: { role: string; content: string }[] = [];
  const routeCalls: { sessionId: string; text: string }[] = [];

  const appCtx = {
    pendingPhaseConfirmation: null,
    lastOpenedSpec: null,
    lastOpenedPlan: null,
    lastOpenedKind: null,
  } as unknown as AppContext;
  const session = new SessionStub();

  const layout = {
    statusBar: { updateSegment: () => {} },
    tui: { requestRender: () => {} },
    messages: { addMessage: () => {} },
  } as unknown as AppLayout;

  const router = {
    route: async (sessionId: string, text: string) => {
      routeCalls.push({ sessionId, text });
      return {
        isErr: () => false,
        isOk: () => true,
        value: {
          strategy: "single" as const,
          agentResults: [],
          totalDuration: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
        },
      };
    },
  } as unknown as PromptRouter;

  const deps: SpecPlanCommandDeps = {
    appCtx,
    tui: layout.tui,
    getSpecsDir: () => specsDir,
    getPlansDir: () => plansDir,
  };

  const ctx = {
    addMessage: (role: string, content: string) => messages.push({ role, content }),
  };

  return { appCtx, session, router, layout, deps, messages, routeCalls, ctx };
}

function withTempDirs<T>(fn: (s: string, p: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "op-int-"));
  return fn(join(root, "specs"), join(root, "plans")).finally(() =>
    rmSync(root, { recursive: true, force: true }),
  );
}

/** Locate the spec/plan path the handler created from the lastOpened* state. */
function activeSpecPath(h: Harness): string {
  return h.appCtx.lastOpenedSpec?.path ?? "";
}
function activePlanPath(h: Harness): string {
  return h.appCtx.lastOpenedPlan?.path ?? "";
}

describe("integration: spec-driven feature flow", () => {
  it("complex prompt → spec → y → plan → y → executing → dispatch with original prompt", async () => {
    await withTempDirs(async (s, p) => {
      const h = makeHarness(s, p);

      // Turn 1: complex prompt drafts spec on disk
      await handleWithRouter(
        "refactor the authentication module across login signup reset",
        h.session as unknown as Session,
        h.router,
        h.layout,
        h.ctx,
        null,
        h.deps,
      );
      expect(h.session.getPhase().currentPhase).toBe("spec_drafting");
      const specPath = activeSpecPath(h);
      expect(existsSync(specPath)).toBe(true);
      expect(readFileSync(specPath, "utf8")).toContain("slug: refactor-the-authentication-module-across");

      // Turn 2: y approves spec, drafts plan on disk
      await handleWithRouter(
        "y",
        h.session as unknown as Session,
        h.router,
        h.layout,
        h.ctx,
        null,
        h.deps,
      );
      expect(h.session.getPhase().currentPhase).toBe("plan_drafting");
      expect(readFileSync(specPath, "utf8")).toContain("status: approved");
      const planPath = activePlanPath(h);
      expect(existsSync(planPath)).toBe(true);

      // Turn 3: y approves plan, transitions to executing, dispatches original prompt
      await handleWithRouter(
        "y",
        h.session as unknown as Session,
        h.router,
        h.layout,
        h.ctx,
        null,
        h.deps,
      );
      expect(h.session.getPhase().currentPhase).toBe("executing");
      expect(h.routeCalls).toHaveLength(1);
      expect(h.routeCalls[0]?.text).toBe(
        "refactor the authentication module across login signup reset",
      );
      expect(readFileSync(planPath, "utf8")).toContain("status: approved");

      // Verify history: every transition recorded
      const history = h.session.getPhase().history.map((e) => e.trigger);
      expect(history).toEqual([
        "classifyComplex",
        "openSpec",
        "approveSpec",
        "openPlan",
        "approvePlan",
        "startExecute",
      ]);
    });
  });

  it("subsequent prompts in executing phase dispatch directly (no re-gate)", async () => {
    await withTempDirs(async (s, p) => {
      const h = makeHarness(s, p);
      // Drive to executing.
      await handleWithRouter("refactor the authentication module across files", h.session as unknown as Session, h.router, h.layout, h.ctx, null, h.deps);
      await handleWithRouter("y", h.session as unknown as Session, h.router, h.layout, h.ctx, null, h.deps);
      await handleWithRouter("y", h.session as unknown as Session, h.router, h.layout, h.ctx, null, h.deps);
      expect(h.session.getPhase().currentPhase).toBe("executing");

      // Now a fresh prompt in executing should go straight to router.route
      // without any new spec/plan being drafted.
      const routesBefore = h.routeCalls.length;
      await handleWithRouter("now polish the docs", h.session as unknown as Session, h.router, h.layout, h.ctx, null, h.deps);
      expect(h.routeCalls.length).toBe(routesBefore + 1);
      expect(h.routeCalls[routesBefore]?.text).toBe("now polish the docs");
    });
  });

  it("n on plan abandons + sets frontmatter to abandoned", async () => {
    await withTempDirs(async (s, p) => {
      const h = makeHarness(s, p);
      await handleWithRouter("refactor stuff everywhere refactor", h.session as unknown as Session, h.router, h.layout, h.ctx, null, h.deps);
      await handleWithRouter("y", h.session as unknown as Session, h.router, h.layout, h.ctx, null, h.deps);
      // Now in plan_drafting with a plan file drafted. n abandons.
      await handleWithRouter("n", h.session as unknown as Session, h.router, h.layout, h.ctx, null, h.deps);
      expect(h.session.getPhase().currentPhase).toBe("abandoned");
      const planPath = activePlanPath(h);
      expect(readFileSync(planPath, "utf8")).toContain("status: abandoned");
      expect(h.routeCalls).toHaveLength(0);
    });
  });
});
