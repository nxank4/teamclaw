/**
 * Regression coverage for Bug U+16: queued prompts must render in
 * the message stream the moment the user presses Enter, not silently
 * accumulate in `state.queue` until the next dispatch starts.
 *
 * Before the fix, the busy-path stamped a `pending: true` user
 * message into the layout but the dim styling read as "nothing
 * happened" to the user — they pressed Enter, the editor cleared,
 * and their prompt seemed to vanish. The post-fix behaviour renders
 * the queued prompt in the same shape as a normal-path prompt:
 * accent-coloured `> ` prefix, full-text body, optional `[@file]`
 * tags. We render directly to `layout.messages` (not via
 * `msgCtx.addMessage`) so the chatSession is not double-written —
 * the drain path writes to chatSession at dispatch time so the LLM
 * history stays in chronological order.
 */
import { EventEmitter } from "node:events";
import { describe, expect, it } from "bun:test";

import { setupInputHandler, type PromptQueueState } from "./input-handler.js";
import { MessagesComponent } from "../tui/components/messages.js";
import { stripAnsi } from "../tui/utils/text-width.js";
import type { AppLayout } from "./layout.js";
import type { AppContext } from "./init-session-router.js";
import type { CommandRegistry } from "../tui/index.js";
import type { AppModeSystem } from "../tui/keybindings/app-mode.js";

interface DividerSpy {
  setLabelCalls: Array<string | null>;
}

function makeStubLayout(): { layout: AppLayout; messages: MessagesComponent; divider: DividerSpy; submit: (text: string, files?: string[]) => Promise<void> } {
  const messages = new MessagesComponent("test-messages");
  const divider: DividerSpy = { setLabelCalls: [] };
  const editor: { onSubmit?: (text: string, files?: string[]) => Promise<void> | void; pushHistory: (s: string) => void } = {
    pushHistory: () => {},
  };
  const layout = {
    editor,
    messages,
    divider: {
      setLabel: (label: string | null) => {
        divider.setLabelCalls.push(label);
      },
    },
    statusBar: { updateSegment: () => {} },
    tui: { requestRender: () => {} },
  } as unknown as AppLayout;
  return {
    layout,
    messages,
    divider,
    submit: async (text, files) => {
      const fn = editor.onSubmit;
      if (!fn) throw new Error("onSubmit not wired");
      await fn(text, files);
    },
  };
}

function makeStubCtx(): AppContext {
  return {
    sessionMgr: null,
    router: null,
    chatSession: null,
    cleanupRouter: null,
    cleanupSession: null,
    doomLoopDetector: { reset: () => {} },
    toolOutputHandler: null,
    configState: null,
    appModeSystem: null,
    memoryCleanup: null,
    onQueueDrain: null,
    toolRegistry: null,
    toolExecutor: null,
  };
}

function makeStubRegistry(): CommandRegistry {
  // Return a thin stub — the message-path test never hits a slash
  // command lookup. Cast through unknown so the type checker accepts
  // the partial shape.
  const reg = {
    register: () => {},
    lookup: () => null,
    getAll: () => [],
  };
  return reg as unknown as CommandRegistry;
}

const stubAppMode = new EventEmitter() as unknown as AppModeSystem;

describe("setupInputHandler — queued prompt rendering (Bug U+16)", () => {
  it("renders the prompt in the message stream when the agent is busy and bumps the queue", async () => {
    const { layout, messages, divider, submit } = makeStubLayout();
    const state: PromptQueueState = { queue: [], agentBusy: true, welcomeMessageActive: false };

    setupInputHandler(layout, makeStubRegistry(), makeStubCtx(), state, stubAppMode, () => {});

    await submit("show me README");

    // Queue grew by one — the drain path will replay this later.
    expect(state.queue).toHaveLength(1);
    expect(state.queue[0]?.text).toBe("show me README");

    // The prompt is visible in the rendered chat right now.
    const text = messages.render(80).map(stripAnsi).join("\n");
    expect(text).toContain("show me README");

    // Divider reflects the queue depth.
    expect(divider.setLabelCalls.at(-1)).toMatch(/1 queued/);
  });

  it("prefixes attached files into the rendered prompt the same way the non-busy path does", async () => {
    const { layout, messages, submit } = makeStubLayout();
    const state: PromptQueueState = { queue: [], agentBusy: true, welcomeMessageActive: false };

    setupInputHandler(layout, makeStubRegistry(), makeStubCtx(), state, stubAppMode, () => {});

    await submit("explain this", ["src/foo.ts"]);

    const text = messages.render(80).map(stripAnsi).join("\n");
    expect(text).toContain("[@foo.ts]");
    expect(text).toContain("explain this");
  });
});
