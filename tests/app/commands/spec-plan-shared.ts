/**
 * Test helpers shared by the /spec, /plan, /approve, /specs, /plans
 * command suites. Build a minimal AppContext + CommandContext + a noop
 * TUI so the slash commands run without touching the real terminal or
 * spawning editors.
 */

import type { CommandContext } from "../../../src/tui/slash/registry.js";
import type { TUI } from "../../../src/tui/core/tui.js";
import type { AppContext } from "../../../src/app/init-session-router.js";
import type { OpenInEditorArgs, OpenInEditorResult } from "../../../src/utils/open-in-editor.js";
import type { SpecPlanCommandDeps } from "../../../src/app/commands/spec.js";

export interface MessageRecord {
  role: string;
  content: string;
  options?: { tag?: string };
}

export interface TestHarness {
  ctx: CommandContext;
  appCtx: AppContext;
  messages: MessageRecord[];
  editorCalls: OpenInEditorArgs[];
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

  const appCtx = {
    sessionMgr: null,
    router: null,
    chatSession: null,
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
  } as unknown as AppContext;

  const tui = { suspend: () => {}, resume: () => {} } as unknown as TUI;
  const editorCalls: OpenInEditorArgs[] = [];
  const editorImpl = async (args: OpenInEditorArgs): Promise<OpenInEditorResult> => {
    editorCalls.push(args);
    return { exitCode: 0, mtimeBefore: 0, mtimeAfter: 0 };
  };

  const makeDeps = (overrides: Partial<SpecPlanCommandDeps> = {}): SpecPlanCommandDeps => ({
    appCtx,
    tui,
    getSpecsDir: () => specsDir,
    getPlansDir: () => plansDir,
    openInEditorImpl: editorImpl,
    ...overrides,
  });

  return { ctx, appCtx, messages, editorCalls, makeDeps };
}
