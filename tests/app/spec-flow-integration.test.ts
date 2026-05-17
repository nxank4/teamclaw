import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleWithRouter } from "../../src/app/prompt-handler.js";
import { emptyPhaseBlock, type Phase, type PhaseTrigger } from "../../src/session/phase-machine.js";
import type { AppContext } from "../../src/app/init-session-router.js";
import type { AppLayout } from "../../src/app/layout.js";
import type { InterviewServices, SpecPlanCommandDeps } from "../../src/app/commands/spec.js";
import type { PromptRouter } from "../../src/router/prompt-router.js";
import type { Session } from "../../src/session/session.js";
import type { InterviewQuestion } from "../../src/spec/interview.js";
import type { CodebaseContext } from "../../src/spec/codebase-scan.js";

/**
 * End-to-end coverage of the interview-driven flow. Mocks the LLM
 * services so the tests run deterministically: each call returns the
 * same canned data.
 *
 *   complex prompt
 *     → interview Q1..Q3 answered
 *     → spec drafted + pendingPhaseConfirmation set
 *   y
 *     → spec approved + plan interview Q1..Q3 answered
 *     → plan drafted + pendingPhaseConfirmation set
 *   y
 *     → plan approved → executing → original prompt dispatched
 */

const QUESTIONS: InterviewQuestion[] = [
  {
    id: "scope",
    question: "Scope?",
    type: "single_select",
    options: [{ label: "Narrow" }, { label: "Broad" }],
    allowCustomInput: true,
  },
  {
    id: "approach",
    question: "Approach?",
    type: "single_select",
    options: [{ label: "Incremental" }, { label: "Big bang" }],
    allowCustomInput: true,
  },
  {
    id: "anything-else",
    question: "Anything else?",
    type: "free_text",
    allowCustomInput: true,
  },
];

const CTX: CodebaseContext = {
  fileTree: "src/\n  auth/\n",
  conventions: "",
  keyFiles: [],
  truncated: false,
};

function services(): InterviewServices {
  return {
    scanCodebase: async () => CTX,
    generateQuestions: async () => QUESTIONS.map((q) => ({ ...q })),
    generateSpec: async () => "## Summary\nSpec body.\n",
    generatePlan: async () => "## Tasks\n- [ ] do x\n",
    generateSlug: async () => "refactor-auth-flow",
  };
}

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
    pendingInterview: null,
    pendingReviseFeedback: null,
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
    getProjectRoot: () => specsDir,
    interviewServices: services(),
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

function run(h: Harness, text: string): Promise<void> {
  return handleWithRouter(text, h.session as unknown as Session, h.router, h.layout, h.ctx, null, h.deps);
}

describe("integration: interview-driven spec/plan flow", () => {
  it("complex prompt → 3 interview answers → y → 3 plan answers → y → executing + dispatch", async () => {
    await withTempDirs(async (s, p) => {
      const h = makeHarness(s, p);

      // Turn 1: start interview.
      await run(h, "refactor the authentication module across login signup reset");
      expect(h.session.getPhase().currentPhase).toBe("spec_drafting");
      expect(h.appCtx.pendingInterview?.kind).toBe("spec");

      // Turns 2-4: answer 3 questions → spec drafted + pendingPhaseConfirmation set.
      await run(h, "1");
      await run(h, "2");
      await run(h, "no migrations");
      expect(h.appCtx.pendingInterview).toBeNull();
      expect(h.appCtx.pendingPhaseConfirmation?.kind).toBe("spec");
      const specPath = h.appCtx.lastOpenedSpec?.path ?? "";
      expect(existsSync(specPath)).toBe(true);
      expect(readFileSync(specPath, "utf8")).toContain("slug: refactor-auth-flow");

      // Turn 5: y approves spec, starts plan interview.
      await run(h, "y");
      expect(h.session.getPhase().currentPhase).toBe("plan_drafting");
      expect(h.appCtx.pendingInterview?.kind).toBe("plan");
      expect(readFileSync(specPath, "utf8")).toContain("status: approved");

      // Turns 6-8: answer 3 plan questions → plan drafted.
      await run(h, "1");
      await run(h, "1");
      await run(h, "tests too");
      expect(h.appCtx.pendingPhaseConfirmation?.kind).toBe("plan");
      const planPath = h.appCtx.lastOpenedPlan?.path ?? "";
      expect(existsSync(planPath)).toBe(true);

      // Turn 9: y approves plan → executing + dispatch.
      await run(h, "y");
      expect(h.session.getPhase().currentPhase).toBe("executing");
      expect(h.routeCalls).toHaveLength(1);
      expect(h.routeCalls[0]?.text).toBe(
        "refactor the authentication module across login signup reset",
      );
      expect(readFileSync(planPath, "utf8")).toContain("status: approved");

      const triggers = h.session.getPhase().history.map((e) => e.trigger);
      expect(triggers).toEqual([
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
      await run(h, "refactor the authentication module across files");
      await run(h, "1"); await run(h, "1"); await run(h, "x");
      await run(h, "y");
      await run(h, "1"); await run(h, "1"); await run(h, "x");
      await run(h, "y");
      expect(h.session.getPhase().currentPhase).toBe("executing");

      const routesBefore = h.routeCalls.length;
      await run(h, "now polish the docs");
      expect(h.routeCalls.length).toBe(routesBefore + 1);
      expect(h.routeCalls[routesBefore]?.text).toBe("now polish the docs");
    });
  });

  it("n on pending plan confirmation abandons + flips plan frontmatter", async () => {
    await withTempDirs(async (s, p) => {
      const h = makeHarness(s, p);
      await run(h, "refactor stuff everywhere refactor");
      await run(h, "1"); await run(h, "1"); await run(h, "x");
      await run(h, "y");
      await run(h, "1"); await run(h, "1"); await run(h, "x");
      // Plan drafted, pendingPhaseConfirmation = { plan }.
      await run(h, "n");
      expect(h.session.getPhase().currentPhase).toBe("abandoned");
      const planPath = h.appCtx.lastOpenedPlan?.path ?? "";
      expect(readFileSync(planPath, "utf8")).toContain("status: abandoned");
      expect(h.routeCalls).toHaveLength(0);
    });
  });
});
