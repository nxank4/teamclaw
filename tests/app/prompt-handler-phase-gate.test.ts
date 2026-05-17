import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleWithRouter } from "../../src/app/prompt-handler.js";
import type { AppContext } from "../../src/app/init-session-router.js";
import type { AppLayout } from "../../src/app/layout.js";
import type { OpenInEditorArgs, OpenInEditorResult } from "../../src/utils/open-in-editor.js";
import type { SpecPlanCommandDeps } from "../../src/app/commands/spec.js";
import type { PromptRouter } from "../../src/router/prompt-router.js";
import type { Session } from "../../src/session/session.js";
import { emptyPhaseBlock, type Phase, type PhaseTrigger } from "../../src/session/phase-machine.js";

interface Capture {
  messages: { role: string; content: string }[];
  editorCalls: OpenInEditorArgs[];
  routeCalls: { sessionId: string; text: string }[];
  appCtx: AppContext;
  session: SessionStub;
  layout: AppLayout;
  router: PromptRouter;
  deps: SpecPlanCommandDeps;
}

class SessionStub {
  id = "test-session";
  private phaseBlock = emptyPhaseBlock();
  private specPath: string | null = null;
  private planPath: string | null = null;

  getPhase() {
    return { ...this.phaseBlock, currentSpecPath: this.specPath, currentPlanPath: this.planPath };
  }
  setPhase(phase: Phase, trigger: PhaseTrigger): void {
    this.phaseBlock = { ...this.phaseBlock, currentPhase: phase };
    this.phaseBlock.history.push({ phase, at: new Date().toISOString(), trigger });
  }
  setSpecPath(p: string | null) { this.specPath = p; }
  setPlanPath(p: string | null) { this.planPath = p; }
}

function makeCapture(specsDir: string, plansDir: string): Capture {
  const messages: { role: string; content: string }[] = [];
  const editorCalls: OpenInEditorArgs[] = [];
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
    tui: { requestRender: () => {}, suspend: () => {}, resume: () => {} },
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

  const editorImpl = async (args: OpenInEditorArgs): Promise<OpenInEditorResult> => {
    editorCalls.push(args);
    return { exitCode: 0, mtimeBefore: 0, mtimeAfter: 0 };
  };

  const deps: SpecPlanCommandDeps = {
    appCtx,
    tui: layout.tui,
    getSpecsDir: () => specsDir,
    getPlansDir: () => plansDir,
    openInEditorImpl: editorImpl,
    phaseNoticeDelayMs: 0,
  };

  return {
    messages,
    editorCalls,
    routeCalls,
    appCtx,
    session,
    layout,
    router,
    deps,
  };
}

function withTempDirs<T>(fn: (specsDir: string, plansDir: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "op-ph-gate-"));
  return fn(join(root, "specs"), join(root, "plans")).finally(() => {
    rmSync(root, { recursive: true, force: true });
  });
}

const msgCtx = (c: Capture) => ({
  addMessage: (role: string, content: string) => c.messages.push({ role, content }),
});

describe("handleWithRouter — phase gate", () => {
  it("trivial prompt: bypass spec flow and dispatch via router.route", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const c = makeCapture(specsDir, plansDir);
      await handleWithRouter(
        "what is 2+2",
        c.session as unknown as Session,
        c.router,
        c.layout,
        msgCtx(c),
        null,
        c.deps,
      );
      expect(c.routeCalls).toHaveLength(1);
      expect(c.routeCalls[0]?.text).toBe("what is 2+2");
      expect(c.editorCalls).toHaveLength(0);
      expect(c.appCtx.pendingPhaseConfirmation).toBeNull();
      expect(c.session.getPhase().currentPhase).toBe("idle");
    });
  });

  it("bypass=true: complex prompt still dispatches directly", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const c = makeCapture(specsDir, plansDir);
      c.deps.bypass = true;
      await handleWithRouter(
        "refactor everything across many files refactor refactor refactor",
        c.session as unknown as Session,
        c.router,
        c.layout,
        msgCtx(c),
        null,
        c.deps,
      );
      expect(c.routeCalls).toHaveLength(1);
      expect(c.editorCalls).toHaveLength(0);
    });
  });

  it("complex prompt + idle: creates spec, opens editor, sets pending confirmation, does NOT dispatch", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const c = makeCapture(specsDir, plansDir);
      await handleWithRouter(
        "refactor the authentication module across login signup",
        c.session as unknown as Session,
        c.router,
        c.layout,
        msgCtx(c),
        null,
        c.deps,
      );
      expect(c.routeCalls).toHaveLength(0);
      expect(c.editorCalls).toHaveLength(1);
      const specFile = c.editorCalls[0]?.path ?? "";
      expect(specFile).toContain("/specs/refactor-the-authentication-module-across.md");
      expect(readFileSync(specFile, "utf8")).toContain("slug: refactor-the-authentication-module-across");
      expect(c.session.getPhase().currentPhase).toBe("spec_drafting");
      expect(c.appCtx.pendingPhaseConfirmation?.kind).toBe("spec");
      expect(c.appCtx.pendingPhaseConfirmation?.originalPrompt).toBe(
        "refactor the authentication module across login signup",
      );
    });
  });

  it("y answer on spec: approves spec, creates plan, opens plan editor, sets plan pending", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const c = makeCapture(specsDir, plansDir);
      // First call: triggers spec creation + sets pending.
      await handleWithRouter(
        "refactor the authentication module across login signup",
        c.session as unknown as Session,
        c.router,
        c.layout,
        msgCtx(c),
        null,
        c.deps,
      );
      // Second call: "y" advances spec → plan.
      await handleWithRouter(
        "y",
        c.session as unknown as Session,
        c.router,
        c.layout,
        msgCtx(c),
        null,
        c.deps,
      );
      // Editor opened twice (spec + plan).
      expect(c.editorCalls).toHaveLength(2);
      const planFile = c.editorCalls[1]?.path ?? "";
      expect(planFile).toContain("/plans/");
      expect(readFileSync(planFile, "utf8")).toContain("## Tasks");
      expect(c.session.getPhase().currentPhase).toBe("plan_drafting");
      expect(c.appCtx.pendingPhaseConfirmation?.kind).toBe("plan");
      // Spec file's frontmatter flipped to approved.
      const specFile = c.editorCalls[0]?.path ?? "";
      expect(readFileSync(specFile, "utf8")).toContain("status: approved");
      // Router has NOT been called yet — plan still needs approval.
      expect(c.routeCalls).toHaveLength(0);
    });
  });

  it("y answer on plan: approves plan, transitions to executing, dispatches original prompt", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const c = makeCapture(specsDir, plansDir);
      await handleWithRouter("refactor the authentication module across login signup", c.session as unknown as Session, c.router, c.layout, msgCtx(c), null, c.deps);
      await handleWithRouter("y", c.session as unknown as Session, c.router, c.layout, msgCtx(c), null, c.deps);
      await handleWithRouter("y", c.session as unknown as Session, c.router, c.layout, msgCtx(c), null, c.deps);
      expect(c.session.getPhase().currentPhase).toBe("executing");
      expect(c.routeCalls).toHaveLength(1);
      expect(c.routeCalls[0]?.text).toBe("refactor the authentication module across login signup");
      const planFile = c.editorCalls[1]?.path ?? "";
      expect(readFileSync(planFile, "utf8")).toContain("status: approved");
      expect(c.appCtx.pendingPhaseConfirmation).toBeNull();
    });
  });

  it("n answer: abandons, transitions to abandoned, flips frontmatter", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const c = makeCapture(specsDir, plansDir);
      await handleWithRouter("refactor module across all files refactor refactor", c.session as unknown as Session, c.router, c.layout, msgCtx(c), null, c.deps);
      await handleWithRouter("n", c.session as unknown as Session, c.router, c.layout, msgCtx(c), null, c.deps);
      expect(c.session.getPhase().currentPhase).toBe("abandoned");
      const specFile = c.editorCalls[0]?.path ?? "";
      expect(readFileSync(specFile, "utf8")).toContain("status: abandoned");
      expect(c.routeCalls).toHaveLength(0);
    });
  });

  it("edit answer: re-opens editor without phase transition", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const c = makeCapture(specsDir, plansDir);
      await handleWithRouter("refactor module across all files refactor refactor", c.session as unknown as Session, c.router, c.layout, msgCtx(c), null, c.deps);
      await handleWithRouter("edit", c.session as unknown as Session, c.router, c.layout, msgCtx(c), null, c.deps);
      expect(c.editorCalls).toHaveLength(2);
      expect(c.editorCalls[1]?.path).toBe(c.editorCalls[0]?.path);
      expect(c.session.getPhase().currentPhase).toBe("spec_drafting");
      expect(c.appCtx.pendingPhaseConfirmation).not.toBeNull();
    });
  });

  it("emits the 3-line phase-transition notice before opening the spec editor", async () => {
    await withTempDirs(async (specsDir, plansDir) => {
      const c = makeCapture(specsDir, plansDir);
      // Use VISUAL=true so the notice line 2 reports a deterministic editor name.
      const origVisual = process.env.VISUAL;
      const origEditor = process.env.EDITOR;
      process.env.VISUAL = "vimtest";
      try {
        await handleWithRouter(
          "refactor the authentication module across login signup reset",
          c.session as unknown as Session,
          c.router,
          c.layout,
          msgCtx(c),
          null,
          c.deps,
        );
      } finally {
        if (origVisual === undefined) delete process.env.VISUAL; else process.env.VISUAL = origVisual;
        if (origEditor === undefined) delete process.env.EDITOR; else process.env.EDITOR = origEditor;
      }

      const noticeIndex = c.messages.findIndex((m) => m.content.includes("Complex prompt detected"));
      expect(noticeIndex).toBeGreaterThanOrEqual(0);
      expect(c.messages[noticeIndex]?.content).toContain("trigger_word refactor");
      expect(c.messages[noticeIndex + 1]?.content).toContain("Opening spec template");
      expect(c.messages[noticeIndex + 1]?.content).toContain("vimtest");
      // Line 3 carries the escape-hatch hint; styled via defaultTheme.dim
      // but the content text itself is what we assert on.
      expect(c.messages[noticeIndex + 2]?.content).toContain("/abandon");
      expect(c.messages[noticeIndex + 2]?.content).toContain("--no-spec");
    });
  });
});
