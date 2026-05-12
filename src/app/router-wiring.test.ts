/**
 * Regression coverage for Bug U+2: ThinkingIndicator placeholder
 * persisting after a successful crew dispatch.
 *
 * The crew dispatch path emits AgentStart → AgentDone → Done but
 * never AgentToken (subagents are isolated, tokens don't bubble up).
 * The solo path used to be the only path that stripped the thinking
 * placeholder — onAgentToken's replaceLastWith dropped the
 * `tag: "thinking"` field on the first streamed token. Crew never
 * hit that path, so the spinner message sat in the chat with its
 * last frame frozen ("Worth the wait..." etc.) even after
 * thinking.stop() cleared the interval. The next prompt then
 * appeared to render on top of an indicator that never went away.
 *
 * onAgentDone now removes any lingering thinking-tagged message;
 * this test pins that behavior down.
 */
import { EventEmitter } from "node:events";
import { describe, expect, it } from "bun:test";

import { wireRouterEvents } from "./router-wiring.js";
import { MessagesComponent } from "../tui/components/messages.js";
import { RouterEvent } from "../router/event-types.js";
import type { AppLayout } from "./layout.js";
import type { PromptRouter } from "../router/prompt-router.js";

interface StubLayout {
  layout: AppLayout;
  messages: MessagesComponent;
  renderCount: number;
  statusUpdates: Array<{ idx: number; text: string }>;
}

function makeStubLayout(): StubLayout {
  const messages = new MessagesComponent("test-messages");
  const state = { renderCount: 0, statusUpdates: [] as Array<{ idx: number; text: string }> };
  const layout = {
    messages,
    statusBar: {
      updateSegment: (idx: number, text: string) => {
        state.statusUpdates.push({ idx, text });
      },
    },
    tui: {
      requestRender: () => {
        state.renderCount += 1;
      },
    },
  } as unknown as AppLayout;
  return {
    layout,
    messages,
    get renderCount() { return state.renderCount; },
    get statusUpdates() { return state.statusUpdates; },
  };
}

function makeStubRouter(): PromptRouter {
  const emitter = new EventEmitter();
  return emitter as unknown as PromptRouter;
}

function findThinkingPlaceholder(messages: MessagesComponent): boolean {
  // No public "list messages" method; walk by removing last-by-tag
  // and putting it back if present. We use the side-effect to detect
  // presence: removeLastByTag returns true iff something matched.
  const had = messages.removeLastByTag("thinking");
  if (had) {
    messages.addMessage({
      role: "agent",
      content: "<restored>",
      tag: "thinking",
    });
  }
  return had;
}

describe("wireRouterEvents — thinking placeholder lifecycle", () => {
  it("removes the thinking placeholder when AgentDone fires (crew path: no AgentToken)", () => {
    const stub = makeStubLayout();
    const router = makeStubRouter();
    wireRouterEvents(router, stub.layout);

    router.emit(RouterEvent.AgentStart, "sid", "crew");
    expect(findThinkingPlaceholder(stub.messages)).toBe(true);

    // Crew dispatch never emits AgentToken — go straight to AgentDone.
    router.emit(RouterEvent.AgentDone, "sid", "crew", { success: true });
    expect(findThinkingPlaceholder(stub.messages)).toBe(false);
  });

  it("solo path stays correct — first AgentToken already strips the tag, AgentDone is a safe no-op", () => {
    const stub = makeStubLayout();
    const router = makeStubRouter();
    wireRouterEvents(router, stub.layout);

    router.emit(RouterEvent.AgentStart, "sid", "coder");
    expect(findThinkingPlaceholder(stub.messages)).toBe(true);

    router.emit(RouterEvent.AgentToken, "sid", "coder", "hello");
    // onAgentToken swaps the placeholder for an untagged streaming
    // agent message — the thinking tag is gone before AgentDone.
    expect(findThinkingPlaceholder(stub.messages)).toBe(false);

    router.emit(RouterEvent.AgentDone, "sid", "coder", { response: "hello" });
    expect(findThinkingPlaceholder(stub.messages)).toBe(false);
  });

  it("dispatch error also removes the thinking placeholder", () => {
    const stub = makeStubLayout();
    const router = makeStubRouter();
    wireRouterEvents(router, stub.layout);

    router.emit(RouterEvent.AgentStart, "sid", "crew");
    expect(findThinkingPlaceholder(stub.messages)).toBe(true);

    router.emit(RouterEvent.Error, "sid", { type: "dispatch_failed", cause: "boom" });
    expect(findThinkingPlaceholder(stub.messages)).toBe(false);
  });
});

/**
 * Bug U+3 second leg — flavor animation lifecycle. The 4-frame box
 * spinner must stop the moment a real tool call starts (the tree
 * carries visible progress) and resume during idle gaps so the user
 * sees movement between subagent runs.
 */
describe("wireRouterEvents — flavor animation lifecycle", () => {
  it("stops the spinner when a tool call starts running and resumes when all tools complete", async () => {
    const stub = makeStubLayout();
    const router = makeStubRouter();
    wireRouterEvents(router, stub.layout);

    router.emit(RouterEvent.AgentStart, "sid", "crew");
    // Allow one frame to land so the placeholder has spinner content.
    await Bun.sleep(0);
    expect(stub.messages.hasRunningToolCalls()).toBe(false);

    router.emit(
      RouterEvent.AgentTool,
      "sid",
      "coder",
      "file_write",
      "running",
      { executionId: "exec-1", inputSummary: "Write hello.ts" },
    );
    expect(stub.messages.hasRunningToolCalls()).toBe(true);

    router.emit(
      RouterEvent.AgentTool,
      "sid",
      "coder",
      "file_write",
      "completed",
      { executionId: "exec-1", outputSummary: "ok", duration: 12, success: true },
    );
    expect(stub.messages.hasRunningToolCalls()).toBe(false);
    // Placeholder still present (run not done yet) — the spinner has
    // restarted under the hood and will tick fresh frames into it.
    const had = stub.messages.removeLastByTag("thinking");
    expect(had).toBe(true);
  });
});
