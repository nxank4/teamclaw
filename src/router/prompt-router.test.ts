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
});
