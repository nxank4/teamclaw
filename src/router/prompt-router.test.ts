/**
 * Regression tests for solo dispatch context isolation.
 *
 * The previous crew dispatch event-flow and renderCrewResultMarkdown
 * suites in this file covered code paths that were removed in the
 * crew->orchestrator refactor. They are deleted; what remains is the
 * v0.4.0-rc.1 smoke-test coverage for the "It looks like you sent X
 * twice" bug and the resumeLatest workspace-scoping bug.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { PromptRouter } from "./prompt-router.js";
import { createSessionManager } from "../session/session-manager.js";
import type { AgentRunner } from "./dispatch-strategy.js";

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
