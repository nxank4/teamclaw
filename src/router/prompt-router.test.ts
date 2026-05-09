/**
 * Regression tests for the crew dispatch event flow.
 *
 * Bug U (TUI freeze post-completion): a successful crew run completed
 * cleanly on disk + in artifacts but the TUI looked frozen because
 * dispatchCrew never emitted RouterEvent.Done. The TUI's
 * onDispatchDone handler — which finalizes the status-bar token-pair
 * display — therefore never fired. Solo dispatch goes through
 * Dispatcher.dispatch which emits Done at line 112 of
 * dispatch-strategy.ts; the crew dispatch path was added later and
 * forgot to mirror that.
 *
 * These tests assert the crew path now emits the same event sequence
 * a TUI consumer expects.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { PromptRouter } from "./prompt-router.js";
import { RouterEvent } from "./event-types.js";
import { createSessionManager } from "../session/session-manager.js";
import type { AgentRunner } from "./dispatch-strategy.js";
import type { CrewRunResult, RunCrewArgs } from "../crew/crew-runner.js";

let homeDir: string;
let prevHome: string | undefined;

beforeEach(() => {
  homeDir = mkdtempSync(path.join(os.tmpdir(), "openpawl-prompt-router-"));
  prevHome = process.env.HOME;
  process.env.HOME = homeDir;
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  rmSync(homeDir, { recursive: true, force: true });
});

const stubAgentRunner: AgentRunner = {
  async run() {
    return {
      agentId: "stub",
      success: true,
      response: "",
      toolCalls: [],
      duration: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
  },
};

function makeCompletedRunCrew(opts?: {
  tokens_used?: number;
  session_id?: string;
}): (args: RunCrewArgs) => Promise<CrewRunResult> {
  return async () => ({
    status: "completed" as const,
    session_id: opts?.session_id ?? "test-session",
    crew_name: "full-stack",
    goal: "test",
    phases: [],
    plan_artifact_id: "plan-1",
    phase_summary_artifact_ids: [],
    tokens_used: opts?.tokens_used ?? 12345,
    ended_by: "all_phases_complete" as const,
  });
}

describe("PromptRouter — crew dispatch event flow", () => {
  it("emits AgentStart, AgentDone, and Done in order on a successful crew run", async () => {
    const sessionMgr = createSessionManager({ sessionsDir: homeDir });
    await sessionMgr.initialize();

    const router = new PromptRouter({}, sessionMgr, null, stubAgentRunner);

    const events: Array<{ type: string; agentId?: string; payload?: unknown }> = [];
    router.on(RouterEvent.AgentStart, (_sid: string, agentId: string) =>
      events.push({ type: "agent:start", agentId }),
    );
    router.on(
      RouterEvent.AgentDone,
      (_sid: string, agentId: string, payload: { success: boolean }) =>
        events.push({ type: "agent:done", agentId, payload }),
    );
    router.on(
      RouterEvent.Done,
      (_sid: string, payload: { totalOutputTokens: number; agentResults: Array<{ agentId: string }> }) =>
        events.push({ type: "dispatch:done", payload }),
    );

    const result = await router.route("sid", "create hello.ts", {
      appMode: "crew",
      runCrewImpl: makeCompletedRunCrew({ tokens_used: 12345 }),
    });

    expect(result.isOk()).toBe(true);
    expect(events.map((e) => e.type)).toEqual([
      "agent:start",
      "agent:done",
      "dispatch:done",
    ]);
    expect(events[0]?.agentId).toBe("crew");
    expect(events[1]?.agentId).toBe("crew");
    expect((events[1]?.payload as { success: boolean }).success).toBe(true);

    // The Done payload is what onDispatchDone reads to update the
    // status-bar token-pair display. It must include the crew's token
    // total or the TUI will silently drop the count.
    const donePayload = events[2]?.payload as {
      totalOutputTokens: number;
      agentResults: Array<{ agentId: string; response: string }>;
    };
    expect(donePayload.totalOutputTokens).toBe(12345);
    expect(donePayload.agentResults).toHaveLength(1);
    expect(donePayload.agentResults[0]?.agentId).toBe("crew");
    expect(donePayload.agentResults[0]?.response).toContain("Crew run completed");
  });

  it("emits AgentDone with success: false but does NOT emit Done when runCrew throws", async () => {
    const sessionMgr = createSessionManager({ sessionsDir: homeDir });
    await sessionMgr.initialize();

    const router = new PromptRouter({}, sessionMgr, null, stubAgentRunner);

    const events: string[] = [];
    router.on(RouterEvent.AgentStart, () => events.push("agent:start"));
    router.on(
      RouterEvent.AgentDone,
      (_sid: string, _agentId: string, payload: { success: boolean }) =>
        events.push(`agent:done(success=${payload.success})`),
    );
    router.on(RouterEvent.Done, () => events.push("dispatch:done"));
    router.on(RouterEvent.Error, () => events.push("dispatch:error"));

    const result = await router.route("sid", "create hello.ts", {
      appMode: "crew",
      runCrewImpl: async () => {
        throw new Error("simulated crew failure");
      },
    });

    expect(result.isErr()).toBe(true);
    // Done is reserved for clean completion — the prompt-handler error
    // branch is responsible for rendering the failure message and
    // resetting the status bar; AgentDone covers the indicator/spinner
    // cleanup. Emitting Done here would let onDispatchDone overwrite
    // the error UI with a stale token-pair display.
    expect(events).toEqual(["agent:start", "agent:done(success=false)"]);
  });

  it("forwards subagent progress events as RouterEvent.AgentTool with the subagent id", async () => {
    // Bug U+2 root cause: the crew run was invisible to the TUI for
    // the entire 5-15 minute duration because subagent tool calls
    // never reached the router. dispatchCrew now subscribes to
    // runCrew's onProgress channel and re-emits each event as
    // RouterEvent.AgentTool — the existing TUI handler in
    // router-wiring.onAgentTool then renders the same tool views
    // solo dispatch already shows. This test pins down the bridge.
    const sessionMgr = createSessionManager({ sessionsDir: homeDir });
    await sessionMgr.initialize();

    const router = new PromptRouter({}, sessionMgr, null, stubAgentRunner);

    type ToolEvent = {
      sessionId: string;
      agentId: string;
      tool: string;
      status: string;
    };
    const toolEvents: ToolEvent[] = [];
    router.on(
      RouterEvent.AgentTool,
      (sessionId: string, agentId: string, tool: string, status: string) => {
        toolEvents.push({ sessionId, agentId, tool, status });
      },
    );

    // Stub runCrew that simulates two subagents firing tool calls
    // — the planner doing a file_read (read-only by manifest) and
    // the coder doing a file_write. dispatchCrew passes its
    // onProgress closure into runCrew; we invoke it directly here
    // to assert the wiring without spinning up a real LLM.
    const stubRunCrew: (args: RunCrewArgs) => Promise<CrewRunResult> = async (
      args,
    ) => {
      args.onProgress?.({
        agent_id: "planner",
        tool_name: "file_read",
        status: "running",
      });
      args.onProgress?.({
        agent_id: "planner",
        tool_name: "file_read",
        status: "completed",
      });
      args.onProgress?.({
        agent_id: "coder",
        tool_name: "file_write",
        status: "running",
        details: { executionId: "exec-2", inputSummary: "src/hello.ts" },
      });
      return {
        status: "completed",
        session_id: "sid",
        crew_name: "full-stack",
        goal: "test",
        phases: [],
        plan_artifact_id: "plan-1",
        phase_summary_artifact_ids: [],
        tokens_used: 100,
        ended_by: "all_phases_complete",
      };
    };

    await router.route("sid", "create hello.ts", {
      appMode: "crew",
      runCrewImpl: stubRunCrew,
    });

    expect(toolEvents).toHaveLength(3);
    expect(toolEvents[0]).toMatchObject({
      sessionId: "sid",
      agentId: "planner",
      tool: "file_read",
      status: "running",
    });
    expect(toolEvents[2]).toMatchObject({
      agentId: "coder",
      tool: "file_write",
      status: "running",
    });
  });
});

describe("PromptRouter — solo dispatch context isolation", () => {
  // Both regressions cover the v0.4.0-rc.1 smoke-test bugs where solo
  // dispatch behaved as if every prompt had prior context that wasn't
  // there. Bug 1 surfaced as "It looks like you sent 'abc' twice"
  // because the input handler appended the current user prompt to
  // the chat session BEFORE route() ran, and the router then forwarded
  // the full session — including the in-flight turn — as priorMessages.
  it("does not pass the current user prompt inside sessionHistory", async () => {
    const sessionMgr = createSessionManager({ sessionsDir: homeDir });
    await sessionMgr.initialize();

    const created = await sessionMgr.create("/tmp/ws");
    expect(created.isOk()).toBe(true);
    const session = created._unsafeUnwrap();

    // Simulate a real turn: prior user/assistant pair, then the input
    // handler appending the current "abc" message before route runs.
    session.addMessage({ role: "user", content: "first question" });
    session.addMessage({ role: "assistant", content: "first answer" });
    session.addMessage({ role: "user", content: "abc" });

    let captured: Array<{ role: string; content: string }> | undefined;
    const capturingRunner: AgentRunner = {
      async run(_id, _prompt, _tools, ctx) {
        captured = ctx.sessionHistory;
        return {
          agentId: "stub",
          success: true,
          response: "ok",
          toolCalls: [],
          duration: 0,
          inputTokens: 0,
          outputTokens: 0,
        };
      },
    };

    const router = new PromptRouter({}, sessionMgr, null, capturingRunner);
    const result = await router.route(session.id, "abc");
    expect(result.isOk()).toBe(true);

    // The runner received the cleaned-up history (prior turns only).
    expect(captured).toBeDefined();
    expect(captured!).toEqual([
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
    ]);
    // Critical: the trailing "abc" must NOT be in priorMessages, or
    // the LLM sees the same user content twice.
    const tail = captured![captured!.length - 1];
    expect(tail?.content === "abc" && tail?.role === "user").toBe(false);
  });

  // Bug 2: a fresh launch in workspace A would auto-resume the most
  // recent session globally, even if it belonged to workspace B —
  // dragging that session's "Implement an Express rate limiter"
  // history into a fresh "hello" prompt. resumeLatest must scope by
  // workspace when the caller asks it to.
  it("resumeLatest scoped to workspace ignores sessions from other workspaces", async () => {
    const sessionMgr = createSessionManager({ sessionsDir: homeDir });
    await sessionMgr.initialize();

    const a = await sessionMgr.create("/tmp/ws-a");
    expect(a.isOk()).toBe(true);
    a._unsafeUnwrap().addMessage({ role: "user", content: "from workspace A" });

    // Restart manager so resumeLatest hits disk, not in-memory state.
    await sessionMgr.shutdown();
    const fresh = createSessionManager({ sessionsDir: homeDir });
    await fresh.initialize();

    const scoped = await fresh.resumeLatest("/tmp/ws-b");
    expect(scoped.isOk()).toBe(true);
    expect(scoped._unsafeUnwrap()).toBeNull();

    const matching = await fresh.resumeLatest("/tmp/ws-a");
    expect(matching.isOk()).toBe(true);
    expect(matching._unsafeUnwrap()).not.toBeNull();
    expect(matching._unsafeUnwrap()!.getState().workingDirectory).toBe("/tmp/ws-a");
  });
});
