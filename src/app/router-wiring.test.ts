/**
 * Regression coverage for `wireRouterEvents`.
 *
 * The crew-display, inline crew-progress, crew tool-call suppression,
 * and crew-specific thinking-placeholder tests were removed alongside
 * the crew→orchestrator refactor — the events and components they
 * exercised no longer exist. What stays is the solo-dispatch coverage
 * for the thinking placeholder lifecycle and the flavor-animation
 * spinner lifecycle.
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
  const state = {
    renderCount: 0,
    statusUpdates: [] as Array<{ idx: number; text: string }>,
  };
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
  it("solo path adds the placeholder and the first AgentToken strips the tag", () => {
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

  it("dispatch error after solo AgentStart removes the thinking placeholder", () => {
    const stub = makeStubLayout();
    const router = makeStubRouter();
    wireRouterEvents(router, stub.layout);

    router.emit(RouterEvent.AgentStart, "sid", "coder");
    expect(findThinkingPlaceholder(stub.messages)).toBe(true);

    router.emit(RouterEvent.Error, "sid", { type: "dispatch_failed", cause: "boom" });
    expect(findThinkingPlaceholder(stub.messages)).toBe(false);
  });
});

describe("wireRouterEvents — flavor animation lifecycle", () => {
  it("stops the spinner when a tool call starts running and resumes when all tools complete", async () => {
    const stub = makeStubLayout();
    const router = makeStubRouter();
    wireRouterEvents(router, stub.layout);

    router.emit(RouterEvent.AgentStart, "sid", "coder");
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
