import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleWithRouter } from "../../src/app/prompt-handler.js";
import type { AppContext } from "../../src/app/init-session-router.js";
import type { AppLayout } from "../../src/app/layout.js";
import type { InterviewServices, SpecPlanCommandDeps } from "../../src/app/commands/spec.js";
import type { PromptRouter } from "../../src/router/prompt-router.js";
import type { Session } from "../../src/session/session.js";
import { emptyPhaseBlock, type Phase, type PhaseTrigger } from "../../src/session/phase-machine.js";
import type {
  AnsweredQuestion,
  InterviewQuestion,
} from "../../src/spec/interview.js";
import type { CodebaseContext } from "../../src/spec/codebase-scan.js";

// ── Test fixtures ────────────────────────────────────────────────

const FIXED_QUESTIONS: InterviewQuestion[] = [
  {
    id: "scope",
    question: "What's the scope?",
    type: "single_select",
    options: [{ label: "Narrow" }, { label: "Broad" }],
    allowCustomInput: true,
  },
  {
    id: "approach",
    question: "Which approach?",
    type: "single_select",
    options: [{ label: "Incremental" }, { label: "Big bang" }],
    allowCustomInput: true,
  },
  {
    id: "anything-else",
    question: "Anything else I should know?",
    type: "free_text",
    allowCustomInput: true,
  },
];

const FIXED_CTX: CodebaseContext = {
  fileTree: "src/\n  auth/\npackage.json",
  conventions: "",
  keyFiles: [],
  truncated: false,
};

const FIXED_SPEC_BODY = "## Summary\nDrafted spec.\n\n## Goals\n- redo auth\n\n## Assumptions\n";
const FIXED_PLAN_BODY = "## Tasks\n- [ ] split login into pieces\n\n## Risks\n\n## Verification\n";

function fakeServices(): InterviewServices {
  return {
    scanCodebase: async () => FIXED_CTX,
    generateQuestions: async () => FIXED_QUESTIONS.map((q) => ({ ...q })),
    generateSpec: async () => FIXED_SPEC_BODY,
    generatePlan: async () => FIXED_PLAN_BODY,
    generateSlug: async () => "refactor-auth-flow",
  };
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

interface Capture {
  messages: { role: string; content: string }[];
  routeCalls: { sessionId: string; text: string }[];
  appCtx: AppContext;
  session: SessionStub;
  layout: AppLayout;
  router: PromptRouter;
  deps: SpecPlanCommandDeps;
}

function makeCapture(specsDir: string, plansDir: string): Capture {
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
    interviewServices: fakeServices(),
  };

  return { messages, routeCalls, appCtx, session, layout, router, deps };
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

function call(c: Capture, text: string): Promise<void> {
  return handleWithRouter(
    text,
    c.session as unknown as Session,
    c.router,
    c.layout,
    msgCtx(c),
    null,
    c.deps,
  );
}

// ── Tests ─────────────────────────────────────────────────────────

describe("handleWithRouter — phase gate (interview flow)", () => {
  it("trivial prompt bypasses the spec flow and dispatches", async () => {
    await withTempDirs(async (s, p) => {
      const c = makeCapture(s, p);
      await call(c, "what is 2+2");
      expect(c.routeCalls).toHaveLength(1);
      expect(c.routeCalls[0]?.text).toBe("what is 2+2");
      expect(c.appCtx.pendingInterview).toBeNull();
      expect(c.appCtx.pendingPhaseConfirmation).toBeNull();
      expect(c.session.getPhase().currentPhase).toBe("idle");
    });
  });

  it("bypass=true: complex prompt still dispatches directly", async () => {
    await withTempDirs(async (s, p) => {
      const c = makeCapture(s, p);
      c.deps.bypass = true;
      await call(c, "refactor everything across many files refactor refactor refactor");
      expect(c.routeCalls).toHaveLength(1);
      expect(c.appCtx.pendingInterview).toBeNull();
    });
  });

  it("complex prompt + idle: scans codebase, generates questions, sets pendingInterview, emits Q1", async () => {
    await withTempDirs(async (s, p) => {
      const c = makeCapture(s, p);
      await call(c, "refactor the authentication module across login signup");
      expect(c.routeCalls).toHaveLength(0);
      expect(c.appCtx.pendingInterview).not.toBeNull();
      expect(c.appCtx.pendingInterview?.kind).toBe("spec");
      expect(c.appCtx.pendingInterview?.questions).toHaveLength(FIXED_QUESTIONS.length);
      expect(c.appCtx.pendingInterview?.currentIndex).toBe(0);
      expect(c.session.getPhase().currentPhase).toBe("spec_drafting");
      const noticeJoined = c.messages.map((m) => m.content).join("\n");
      expect(noticeJoined).toContain("op:phase");
      expect(noticeJoined).toContain("Complex prompt detected");
      expect(noticeJoined).toContain("op:interview");
      expect(noticeJoined).toContain("What's the scope?");
    });
  });

  it("answering all interview questions drafts the spec and queues a y/n", async () => {
    await withTempDirs(async (s, p) => {
      const c = makeCapture(s, p);
      await call(c, "refactor the authentication module across login signup");
      await call(c, "1");
      await call(c, "2");
      await call(c, "no breaking changes please");

      expect(c.appCtx.pendingInterview).toBeNull();
      expect(c.appCtx.pendingPhaseConfirmation?.kind).toBe("spec");
      const specPath = c.appCtx.pendingPhaseConfirmation?.specPath ?? "";
      expect(existsSync(specPath)).toBe(true);
      expect(readFileSync(specPath, "utf8")).toContain("slug: refactor-auth-flow");
      expect(readFileSync(specPath, "utf8")).toContain("## Summary");
      expect(c.appCtx.pendingPhaseConfirmation?.answers).toHaveLength(3);
      const fb = (c.appCtx.pendingPhaseConfirmation?.answers ?? []) as AnsweredQuestion[];
      expect(fb[2]?.answer.kind).toBe("text");
    });
  });

  it("y on spec starts the plan interview (no editor, codebase context reused)", async () => {
    await withTempDirs(async (s, p) => {
      const c = makeCapture(s, p);
      await call(c, "refactor the authentication module across login signup");
      await call(c, "1"); await call(c, "1"); await call(c, "free text");
      await call(c, "y");
      expect(c.appCtx.pendingInterview?.kind).toBe("plan");
      expect(c.appCtx.pendingInterview?.currentIndex).toBe(0);
      expect(c.session.getPhase().currentPhase).toBe("plan_drafting");
      const specPath = c.appCtx.lastOpenedSpec?.path ?? "";
      expect(readFileSync(specPath, "utf8")).toContain("status: approved");
    });
  });

  it("answering plan questions + y → executing + dispatches original prompt", async () => {
    await withTempDirs(async (s, p) => {
      const c = makeCapture(s, p);
      await call(c, "refactor the authentication module across login signup");
      await call(c, "1"); await call(c, "1"); await call(c, "x");
      await call(c, "y");
      await call(c, "1"); await call(c, "1"); await call(c, "no");
      expect(c.appCtx.pendingPhaseConfirmation?.kind).toBe("plan");
      await call(c, "y");
      expect(c.session.getPhase().currentPhase).toBe("executing");
      expect(c.routeCalls).toHaveLength(1);
      expect(c.routeCalls[0]?.text).toBe("refactor the authentication module across login signup");
      const planPath = c.appCtx.lastOpenedPlan?.path ?? "";
      expect(readFileSync(planPath, "utf8")).toContain("status: approved");
    });
  });

  it("n during pending spec confirmation abandons + flips frontmatter", async () => {
    await withTempDirs(async (s, p) => {
      const c = makeCapture(s, p);
      await call(c, "refactor module across all files refactor refactor");
      await call(c, "1"); await call(c, "1"); await call(c, "x");
      const specPath = c.appCtx.lastOpenedSpec?.path ?? "";
      await call(c, "n");
      expect(c.session.getPhase().currentPhase).toBe("abandoned");
      expect(readFileSync(specPath, "utf8")).toContain("status: abandoned");
      expect(c.routeCalls).toHaveLength(0);
    });
  });

  it("edit on pending phase confirmation emits external-edit hint, no transition", async () => {
    await withTempDirs(async (s, p) => {
      const c = makeCapture(s, p);
      await call(c, "refactor module across all files refactor refactor");
      await call(c, "1"); await call(c, "1"); await call(c, "x");
      const phaseBefore = c.session.getPhase().currentPhase;
      const messagesBefore = c.messages.length;
      await call(c, "edit");
      expect(c.session.getPhase().currentPhase).toBe(phaseBefore);
      const lastMsg = c.messages[c.messages.length - 1];
      expect(lastMsg?.content).toContain("Re-open");
      expect(lastMsg?.content).toContain("editor");
      expect(c.messages.length).toBe(messagesBefore + 1);
    });
  });

  it("skip during interview applies a safe default and advances", async () => {
    await withTempDirs(async (s, p) => {
      const c = makeCapture(s, p);
      await call(c, "refactor module across all files refactor refactor");
      await call(c, "skip");
      expect(c.appCtx.pendingInterview?.currentIndex).toBe(1);
      const firstAnswer = c.appCtx.pendingInterview?.answers[0];
      expect(firstAnswer?.answer.kind).toBe("skip");
    });
  });

  it("invalid number during interview re-prompts the same question", async () => {
    await withTempDirs(async (s, p) => {
      const c = makeCapture(s, p);
      await call(c, "refactor module across all files refactor refactor");
      const indexBefore = c.appCtx.pendingInterview?.currentIndex;
      await call(c, "9");
      const indexAfter = c.appCtx.pendingInterview?.currentIndex;
      expect(indexAfter).toBe(indexBefore);
      expect(c.messages.some((m) => m.role === "error" && m.content.includes("9"))).toBe(true);
    });
  });
});
