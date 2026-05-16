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
import { CrewProgressView } from "../tui/components/crew-progress-view.js";
import { createCrewRunState } from "./crew-run-state.js";
import { CrewPhaseSchema } from "../crew/types.js";
import type { AppLayout } from "./layout.js";
import type { PromptRouter } from "../router/prompt-router.js";

interface StubLayout {
  layout: AppLayout;
  messages: MessagesComponent;
  crewProgress: CrewProgressView;
  renderCount: number;
  fixedRenderCount: number;
  statusUpdates: Array<{ idx: number; text: string }>;
  fixedHidden: Map<string, boolean>;
}

function makeStubLayout(): StubLayout {
  const messages = new MessagesComponent("test-messages");
  const crewProgress = new CrewProgressView("crew-progress", {
    state: createCrewRunState(""),
    spinnerFrame: 0,
  });
  const state = {
    renderCount: 0,
    fixedRenderCount: 0,
    statusUpdates: [] as Array<{ idx: number; text: string }>,
    fixedHidden: new Map<string, boolean>(),
  };
  const layout = {
    messages,
    crewProgress,
    statusBar: {
      updateSegment: (idx: number, text: string) => {
        state.statusUpdates.push({ idx, text });
      },
    },
    tui: {
      requestRender: () => {
        state.renderCount += 1;
      },
      requestFixedRender: () => {
        state.fixedRenderCount += 1;
      },
      setFixedBottomHidden: (id: string, hidden: boolean) => {
        state.fixedHidden.set(id, hidden);
      },
    },
  } as unknown as AppLayout;
  return {
    layout,
    messages,
    crewProgress,
    get renderCount() { return state.renderCount; },
    get fixedRenderCount() { return state.fixedRenderCount; },
    get statusUpdates() { return state.statusUpdates; },
    get fixedHidden() { return state.fixedHidden; },
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
  it("crew dispatch does NOT add a solo thinking placeholder (CrewProgressView is the indicator)", () => {
    const stub = makeStubLayout();
    const router = makeStubRouter();
    wireRouterEvents(router, stub.layout);

    router.emit(RouterEvent.AgentStart, "sid", "crew");
    // Bug 1 fix: no placeholder is added for crew; the bottom tree is
    // the single source of "what's happening".
    expect(findThinkingPlaceholder(stub.messages)).toBe(false);

    // AgentDone is a safe no-op since there's nothing to remove.
    router.emit(RouterEvent.AgentDone, "sid", "crew", { success: true });
    expect(findThinkingPlaceholder(stub.messages)).toBe(false);
  });

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

/**
 * Regressions for the crew-display-bugs trio:
 *   1) Double spinner — solo thinking + crew tree both ticking.
 *   2) Duplicate "Planner" header on the first crew subagent token.
 *   3) Token footer stuck at 0 — CrewTokens not ticking per-token.
 */
describe("wireRouterEvents — crew display regressions", () => {
  function countAgentMessages(messages: MessagesComponent): number {
    // Probe by removing one-at-a-time; restore via tag round-trip is not
    // available, so use the public getMessageCount() and check role tags
    // indirectly via the snapshot. Simpler: read messages from the
    // component's internal accessor.
    // MessagesComponent exposes getMessageCount(); count agent bubbles by
    // removing until we hit non-agent or empty. Since the component does
    // not expose a snapshot, we count by addMessage side-effects: every
    // agent bubble is one entry. Acceptable in this test: after
    // AgentStart + first AgentToken, the only entries are agent bubbles.
    return messages.getMessageCount();
  }

  it("emits exactly one agent bubble for the first crew subagent token (no duplicate Planner header)", () => {
    const stub = makeStubLayout();
    const router = makeStubRouter();
    wireRouterEvents(router, stub.layout);

    router.emit(RouterEvent.AgentStart, "sid", "crew");
    // No thinking placeholder under crew, so the message count starts at 0.
    expect(stub.messages.getMessageCount()).toBe(0);

    // First synthesized planner token (the markdown plan) arrives.
    router.emit(RouterEvent.AgentToken, "sid", "planner", "**Plan: 1 phase, 1 task**");

    // Bug 2 fix: exactly one Planner bubble, not two.
    expect(countAgentMessages(stub.messages)).toBe(1);

    // Subsequent same-agent tokens append to the existing bubble.
    router.emit(RouterEvent.AgentToken, "sid", "planner", "\n  t1 · Tester · ...");
    expect(countAgentMessages(stub.messages)).toBe(1);
  });

  it("CrewTokens uses the requestFixedRender fast path so the chat isn't re-rendered per chunk", () => {
    const stub = makeStubLayout();
    const router = makeStubRouter();
    wireRouterEvents(router, stub.layout);

    router.emit(RouterEvent.AgentStart, "sid", "crew");
    // The crew overlay reveal triggered a full requestRender (panel
    // visibility flipped, bottom-fixed height changed). Snapshot the
    // counters and assert that subsequent token deltas don't fire
    // requestRender again.
    const fullBaseline = stub.renderCount;
    const fixedBaseline = stub.fixedRenderCount;

    router.emit(RouterEvent.CrewTokens, "sid", "planner", 0, 1);
    router.emit(RouterEvent.CrewTokens, "sid", "planner", 0, 5);
    router.emit(RouterEvent.CrewTokens, "sid", "planner", 0, 2);

    // Three fast-path renders, zero new full renders.
    expect(stub.fixedRenderCount - fixedBaseline).toBe(3);
    expect(stub.renderCount).toBe(fullBaseline);
  });

  it("CrewTokens ticks the footer per emitted token via dispatchCrew.onToken bridge", () => {
    const stub = makeStubLayout();
    const router = makeStubRouter();
    wireRouterEvents(router, stub.layout);

    router.emit(RouterEvent.AgentStart, "sid", "crew");

    // Simulate three per-token CrewTokens deltas (output=1 each) and
    // a wrapper-style INPUT-only reconcile.
    router.emit(RouterEvent.CrewTokens, "sid", "planner", 0, 1);
    router.emit(RouterEvent.CrewTokens, "sid", "planner", 0, 1);
    router.emit(RouterEvent.CrewTokens, "sid", "planner", 0, 1);
    router.emit(RouterEvent.CrewTokens, "sid", "planner", 4000, 0);

    const state = stub.crewProgress.getProps().state;
    expect(state.totalOutputTokens).toBe(3);
    expect(state.totalInputTokens).toBe(4000);
    expect(state.agents.get("planner")?.outputTokens).toBe(3);
    expect(state.agents.get("planner")?.inputTokens).toBe(4000);
  });
});

/**
 * Bug U+3 second leg — flavor animation lifecycle. The 4-frame box
 * spinner must stop the moment a real tool call starts (the tree
 * carries visible progress) and resume during idle gaps so the user
 * sees movement between subagent runs.
 */
/**
 * Crew progress overlay — the sticky tree above the divider is driven
 * entirely from RouterEvents. These tests pin the visibility, state
 * mutation, and timer behavior so the run feels coherent end-to-end.
 */
describe("wireRouterEvents — crew progress overlay", () => {
  it("shows the overlay on AgentStart(crew) and updates state on the new RouterEvents", () => {
    const stub = makeStubLayout();
    const router = makeStubRouter();
    wireRouterEvents(router, stub.layout);

    router.emit(RouterEvent.AgentStart, "sid", "crew");
    expect(stub.fixedHidden.get("crew-progress")).toBe(false);
    // State exists and is empty.
    expect(stub.crewProgress.getProps().state.agents.size).toBe(0);

    const phases = [
      CrewPhaseSchema.parse({
        id: "p1",
        name: "Setup",
        description: "",
        complexity_tier: "2",
        tasks: [
          { id: "t1", phase_id: "p1", description: "scan", assigned_agent: "tester", depends_on: [] },
          { id: "t2", phase_id: "p1", description: "verify", assigned_agent: "tester", depends_on: [] },
          { id: "t3", phase_id: "p1", description: "write", assigned_agent: "coder", depends_on: [] },
        ],
      }),
    ];
    router.emit(RouterEvent.CrewPlanReady, "sid", phases);
    const state = stub.crewProgress.getProps().state;
    expect(state.agents.get("planner")?.status).toBe("done");
    expect(state.agents.get("planner")?.metric).toBe("3 tasks");
    expect(state.agents.get("tester")?.status).toBe("queued");
    expect(state.agents.get("tester")?.metric).toBe("2 tasks");
    expect(state.agents.get("coder")?.status).toBe("queued");
    expect(state.agents.get("coder")?.metric).toBe("1 task");

    router.emit(RouterEvent.CrewAgentStart, "sid", "coder", 1);
    expect(stub.crewProgress.getProps().state.agents.get("coder")?.status).toBe("running");

    router.emit(RouterEvent.CrewTokens, "sid", "coder", 1200, 800);
    expect(stub.crewProgress.getProps().state.agents.get("coder")?.inputTokens).toBe(1200);
    expect(stub.crewProgress.getProps().state.totalInputTokens).toBe(1200);
    expect(stub.crewProgress.getProps().state.totalOutputTokens).toBe(800);

    router.emit(RouterEvent.CrewAgentDone, "sid", "coder", "wrote hello.ts");
    expect(stub.crewProgress.getProps().state.agents.get("coder")?.status).toBe("done");
    expect(stub.crewProgress.getProps().state.agents.get("coder")?.metric).toBe("wrote hello.ts");

    router.emit(RouterEvent.CrewAgentBlocked, "sid", "tester", "shell_exec missing");
    expect(stub.crewProgress.getProps().state.agents.get("tester")?.status).toBe("blocked");
    expect(stub.crewProgress.getProps().state.agents.get("tester")?.metric).toBe("shell_exec missing");
  });

  it("hides the overlay 3s after AgentDone(crew) and marks state complete", async () => {
    const stub = makeStubLayout();
    const router = makeStubRouter();
    wireRouterEvents(router, stub.layout);

    router.emit(RouterEvent.AgentStart, "sid", "crew");
    expect(stub.fixedHidden.get("crew-progress")).toBe(false);
    router.emit(RouterEvent.AgentDone, "sid", "crew", { success: true });
    // markComplete fired synchronously; isComplete is true even before the timer expires.
    expect(stub.crewProgress.getProps().state.isComplete).toBe(true);
    // Hide is deferred — still visible immediately after AgentDone.
    expect(stub.fixedHidden.get("crew-progress")).toBe(false);
    await Bun.sleep(3050);
    expect(stub.fixedHidden.get("crew-progress")).toBe(true);
  });

  it("solo dispatch does not toggle the crew overlay", () => {
    const stub = makeStubLayout();
    const router = makeStubRouter();
    wireRouterEvents(router, stub.layout);

    router.emit(RouterEvent.AgentStart, "sid", "coder");
    // Crew panel is not flipped visible for solo agents.
    expect(stub.fixedHidden.get("crew-progress")).toBeUndefined();
    router.emit(RouterEvent.AgentToken, "sid", "coder", "hi");
    router.emit(RouterEvent.AgentDone, "sid", "coder", { response: "hi" });
    expect(stub.fixedHidden.get("crew-progress")).toBeUndefined();
  });
});

describe("wireRouterEvents — crew tool-call chat suppression", () => {
  it("suppresses startToolCall on the chat stream during a crew run", () => {
    const stub = makeStubLayout();
    const router = makeStubRouter();
    wireRouterEvents(router, stub.layout);

    router.emit(RouterEvent.AgentStart, "sid", "crew");
    // Subagent tool fires with the real per-agent id, not "crew".
    router.emit(
      RouterEvent.AgentTool,
      "sid",
      "planner",
      "shell_exec",
      "running",
      { executionId: "exec-c1", inputSummary: "ls" },
    );

    // No tool entry on the messages component — the bottom CrewProgressView
    // tree is the single source of progress during a crew run.
    expect(stub.messages.hasRunningToolCalls()).toBe(false);
    // Status bar still surfaces the active subagent + tool.
    const statusHits = stub.statusUpdates.filter((u) => u.text.includes("shell_exec"));
    expect(statusHits.length).toBeGreaterThan(0);
  });

  it("solo dispatch still renders tool-call lines on the chat stream", () => {
    const stub = makeStubLayout();
    const router = makeStubRouter();
    wireRouterEvents(router, stub.layout);

    router.emit(RouterEvent.AgentStart, "sid", "coder");
    router.emit(
      RouterEvent.AgentTool,
      "sid",
      "coder",
      "file_write",
      "running",
      { executionId: "exec-s1", inputSummary: "Write hello.ts" },
    );

    expect(stub.messages.hasRunningToolCalls()).toBe(true);
  });

  it("tool-call lines resume in solo dispatch after a crew run completes", () => {
    const stub = makeStubLayout();
    const router = makeStubRouter();
    wireRouterEvents(router, stub.layout);

    router.emit(RouterEvent.AgentStart, "sid", "crew");
    router.emit(
      RouterEvent.AgentTool,
      "sid",
      "planner",
      "shell_exec",
      "running",
      { executionId: "exec-c1", inputSummary: "ls" },
    );
    // Suppressed during crew.
    expect(stub.messages.hasRunningToolCalls()).toBe(false);

    router.emit(RouterEvent.AgentDone, "sid", "crew", { success: true });
    router.emit(RouterEvent.AgentStart, "sid", "coder");
    router.emit(
      RouterEvent.AgentTool,
      "sid",
      "coder",
      "file_write",
      "running",
      { executionId: "exec-s1", inputSummary: "Write hello.ts" },
    );

    // Post-crew solo dispatch renders normally.
    expect(stub.messages.hasRunningToolCalls()).toBe(true);
  });

  it("dispatch error during a crew run clears the suppression flag", () => {
    const stub = makeStubLayout();
    const router = makeStubRouter();
    wireRouterEvents(router, stub.layout);

    router.emit(RouterEvent.AgentStart, "sid", "crew");
    router.emit(RouterEvent.Error, "sid", { type: "dispatch_failed", cause: "boom" });

    // After the error tears the run down, a fresh solo tool should render.
    router.emit(RouterEvent.AgentStart, "sid", "coder");
    router.emit(
      RouterEvent.AgentTool,
      "sid",
      "coder",
      "file_write",
      "running",
      { executionId: "exec-s2", inputSummary: "Write x.ts" },
    );
    expect(stub.messages.hasRunningToolCalls()).toBe(true);
  });
});

describe("wireRouterEvents — flavor animation lifecycle", () => {
  it("stops the spinner when a tool call starts running and resumes when all tools complete", async () => {
    const stub = makeStubLayout();
    const router = makeStubRouter();
    wireRouterEvents(router, stub.layout);

    // Solo dispatch — the only path that uses the chat-stream thinking
    // placeholder. Crew dispatch no longer adds one (the bottom
    // CrewProgressView is the indicator there).
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
