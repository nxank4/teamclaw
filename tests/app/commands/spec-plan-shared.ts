/**
 * Test helpers shared by the /spec, /plan, /approve, /specs, /plans
 * command suites. Build a minimal AppContext + CommandContext + a noop
 * TUI so the slash commands run without touching the real terminal.
 *
 * The in-TUI editor flow was removed — commands write files directly
 * and report paths to the user; the harness no longer mocks an editor.
 */

import { emptyPhaseBlock, type Phase, type PhaseTrigger } from "../../../src/session/phase-machine.js";
import type { CommandContext } from "../../../src/tui/slash/registry.js";
import type { TUI } from "../../../src/tui/core/tui.js";
import type { AppContext } from "../../../src/app/init-session-router.js";
import type { SpecPlanCommandDeps } from "../../../src/app/commands/spec.js";
import type { Session } from "../../../src/session/session.js";
import type { PromptRouter } from "../../../src/router/prompt-router.js";

/**
 * Minimal Session stub that tracks phase state. Cast through unknown
 * to Session — only the methods the slash commands and phase helpers
 * call need to be present (getPhase, setPhase, setSpecPath, setPlanPath).
 */
export class PhaseSessionStub {
  id = "test-session";
  private block = emptyPhaseBlock();
  getPhase() {
    return { ...this.block };
  }
  setPhase(phase: Phase, trigger: PhaseTrigger) {
    this.block = { ...this.block, currentPhase: phase };
    this.block.history.push({ phase, at: new Date().toISOString(), trigger });
  }
  setSpecPath(p: string | null) {
    this.block = { ...this.block, currentSpecPath: p };
  }
  setPlanPath(p: string | null) {
    this.block = { ...this.block, currentPlanPath: p };
  }
}

export interface MessageRecord {
  role: string;
  content: string;
  options?: { tag?: string };
}

export interface TestHarness {
  ctx: CommandContext;
  appCtx: AppContext;
  session: PhaseSessionStub;
  messages: MessageRecord[];
  routerAbortCalls: string[];
  /** Build a SpecPlanCommandDeps pointing at the test dirs. */
  makeDeps: (overrides?: Partial<SpecPlanCommandDeps>) => SpecPlanCommandDeps;
}

export function makeHarness(specsDir: string, plansDir: string): TestHarness {
  const messages: MessageRecord[] = [];
  const ctx: CommandContext = {
    addMessage: (role, content, options) => {
      messages.push({ role, content, options });
    },
    clearMessages: () => { messages.length = 0; },
    requestRender: () => {},
    exit: () => {},
  };

  const session = new PhaseSessionStub();
  const routerAbortCalls: string[] = [];
  const routerStub = {
    abort: (sid: string) => routerAbortCalls.push(sid),
    route: async () => ({
      isErr: () => false,
      isOk: () => true,
      value: {
        strategy: "single" as const,
        agentResults: [],
        totalDuration: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
      },
    }),
  } as unknown as PromptRouter;

  const appCtx = {
    sessionMgr: null,
    router: routerStub,
    chatSession: session as unknown as Session,
    cleanupRouter: null,
    cleanupSession: null,
    doomLoopDetector: null,
    toolOutputHandler: null,
    configState: null,
    memoryCleanup: null,
    onQueueDrain: null,
    toolRegistry: null,
    toolExecutor: null,
    compactDeps: null,
    lastOpenedSpec: null,
    lastOpenedPlan: null,
    lastOpenedKind: null,
    pendingPhaseConfirmation: null,
    specPlanDeps: null,
  } as unknown as AppContext;

  const tui = {} as unknown as TUI;

  const makeDeps = (overrides: Partial<SpecPlanCommandDeps> = {}): SpecPlanCommandDeps => ({
    appCtx,
    tui,
    getSpecsDir: () => specsDir,
    getPlansDir: () => plansDir,
    ...overrides,
  });

  return { ctx, appCtx, session, messages, routerAbortCalls, makeDeps };
}
