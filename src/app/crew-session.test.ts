import { afterEach, describe, expect, it } from "bun:test";

import { CrewSession, DOUBLE_ESCAPE_WINDOW_MS } from "./crew-session.js";
import { buildReanchorPrompt } from "../crew/drift-reanchor.js";
import { CrewPhaseSchema } from "../crew/types.js";
import type { CrewManifest } from "../crew/manifest/index.js";
import type { PhaseSummaryArtifactPayload } from "../crew/artifacts/types.js";
import {
  clearActiveCrew,
  getActiveCheckpointCoordinator,
  getActiveCrew,
} from "../crew/checkpoint-registry.js";
import { getActiveCrewEscapeHandler } from "./crew-session-hook.js";

const fixtureManifest: CrewManifest = {
  name: "full-stack",
  description: "test",
  version: "1.0.0",
  constraints: {
    min_agents: 2,
    max_agents: 10,
    recommended_range: [3, 5],
    required_roles: [],
  },
  agents: [
    {
      id: "planner",
      name: "Planner",
      description: "Plans",
      prompt: "x",
      tools: ["file_read"],
    },
    {
      id: "coder",
      name: "Coder",
      description: "Codes",
      prompt: "x",
      tools: ["file_read", "file_write"],
    },
  ],
};

function fixturePhase(id: string) {
  return CrewPhaseSchema.parse({
    id,
    name: `Phase ${id}`,
    description: "x",
    complexity_tier: "2",
    tasks: [
      {
        id: "t1",
        phase_id: id,
        description: "first",
        assigned_agent: "coder",
        depends_on: [],
        status: "completed",
      },
    ],
  });
}

const fixturePayload: PhaseSummaryArtifactPayload = {
  phase_id: "p1",
  tasks_completed: 1,
  tasks_failed: 0,
  tasks_blocked: 0,
  files_created: [],
  files_modified: [],
  key_decisions: [],
  agent_confidences: {},
};

function makeHost() {
  const messages: Array<{ role: string; content: string }> = [];
  let renderCount = 0;
  const summaryShows: number[] = [];
  const reanchorShows: number[] = [];
  return {
    messages,
    renderCount: () => renderCount,
    summaryShowCount: () => summaryShows.length,
    reanchorShowCount: () => reanchorShows.length,
    host: {
      addMessage: (role: "system" | "agent" | "error", content: string) =>
        messages.push({ role, content }),
      requestRender: () => {
        renderCount++;
      },
      showPhaseSummaryView: () => summaryShows.push(Date.now()),
      hidePhaseSummaryView: () => {},
      showReanchorView: () => reanchorShows.push(Date.now()),
      hideReanchorView: () => {},
      width: 80,
    },
  };
}

afterEach(() => {
  clearActiveCrew();
});

describe("CrewSession — registration", () => {
  it("registers as the active crew on construction", () => {
    const { host } = makeHost();
    const sess = new CrewSession(
      {
        session_id: "s1",
        manifest: fixtureManifest,
        goal: "g",
        phases: [fixturePhase("p1")],
      },
      host,
    );
    expect(getActiveCrew()?.session_id).toBe("s1");
    sess.dispose();
    expect(getActiveCrew()).toBeNull();
  });

  it("registers the Escape handler hook for keybindings to find", () => {
    const { host } = makeHost();
    expect(getActiveCrewEscapeHandler()).toBeNull();
    const sess = new CrewSession(
      {
        session_id: "s2",
        manifest: fixtureManifest,
        goal: "g",
        phases: [fixturePhase("p1")],
      },
      host,
    );
    const handler = getActiveCrewEscapeHandler();
    expect(handler).not.toBeNull();
    expect(handler?.()).toBe("pause");
    sess.dispose();
    expect(getActiveCrewEscapeHandler()).toBeNull();
  });
});

describe("CrewSession — Escape double-tap", () => {
  it("first Escape pauses, second within window aborts", () => {
    const { host, messages } = makeHost();
    const sess = new CrewSession(
      {
        session_id: "s1",
        manifest: fixtureManifest,
        goal: "g",
        phases: [fixturePhase("p1")],
      },
      host,
    );
    const r1 = sess.handleEscape(1000);
    expect(r1).toBe("pause");
    expect(sess.coordinator.isPaused()).toBe(true);

    const r2 = sess.handleEscape(1000 + DOUBLE_ESCAPE_WINDOW_MS - 50);
    expect(r2).toBe("abort");
    expect(sess.coordinator.isAbortRequested()).toBe(true);
    expect(messages.some((m) => m.content.includes("Aborting"))).toBe(true);
    sess.dispose();
  });

  it("Escape outside the window pauses again instead of aborting", () => {
    const { host } = makeHost();
    const sess = new CrewSession(
      {
        session_id: "s1",
        manifest: fixtureManifest,
        goal: "g",
        phases: [fixturePhase("p1")],
      },
      host,
    );
    sess.handleEscape(1000);
    const r2 = sess.handleEscape(1000 + DOUBLE_ESCAPE_WINDOW_MS + 500);
    expect(r2).toBe("pause");
    expect(sess.coordinator.isAbortRequested()).toBe(false);
    sess.dispose();
  });
});

describe("CrewSession — phase summary presentation", () => {
  it("presentPhaseGate renders a PhaseSummaryView via the host", () => {
    const { host, summaryShowCount } = makeHost();
    const sess = new CrewSession(
      {
        session_id: "s1",
        manifest: fixtureManifest,
        goal: "g",
        phases: [fixturePhase("p1")],
      },
      host,
    );
    sess.presentPhaseGate({
      phase: fixturePhase("p1"),
      payload: fixturePayload,
    });
    expect(summaryShowCount()).toBe(1);
    expect(sess.getCurrentPhaseSummaryView()?.id).toBe("phase-summary-p1");
    sess.dispose();
  });

  it("falls back to addMessage when host has no showPhaseSummaryView", () => {
    const messages: Array<{ role: string; content: string }> = [];
    const sess = new CrewSession(
      {
        session_id: "s1",
        manifest: fixtureManifest,
        goal: "g",
        phases: [fixturePhase("p1")],
      },
      {
        addMessage: (role, content) => messages.push({ role, content }),
        requestRender: () => {},
        width: 80,
      },
    );
    sess.presentPhaseGate({
      phase: fixturePhase("p1"),
      payload: fixturePayload,
    });
    expect(messages.length).toBe(1);
    expect(messages[0]?.content).toContain("Phase complete");
    sess.dispose();
  });
});

describe("CrewSession — reanchor presentation", () => {
  it("coordinator reanchor_open event presents the view", () => {
    const { host, reanchorShowCount } = makeHost();
    const sess = new CrewSession(
      {
        session_id: "s1",
        manifest: fixtureManifest,
        goal: "Add /health",
        phases: [fixturePhase("p1")],
      },
      host,
    );

    const reanchor = buildReanchorPrompt({
      original_goal: "Add /health",
      drifting_decisions: [],
      current_phase: { id: "p1", name: "Initial" },
      drift_score: 0.85,
    });

    // Drive the coordinator's waitForReanchor; the listener should fire.
    const pending = sess.coordinator.waitForReanchor({ reanchor });
    // Allow microtasks to flush.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(reanchorShowCount()).toBe(1);
        expect(sess.getCurrentReanchorView()).not.toBeNull();
        sess.coordinator.resolveReanchor({ option: "abort" });
        void pending.then(() => {
          sess.dispose();
          resolve();
        });
      }, 5);
    });
  });
});

describe("CrewSession — registers coordinator the router can resolve", () => {
  it("getActiveCheckpointCoordinator() returns the session's coord while alive", () => {
    const { host } = makeHost();
    const sess = new CrewSession(
      {
        session_id: "s-route",
        manifest: fixtureManifest,
        goal: "g",
        phases: [fixturePhase("p1")],
      },
      host,
    );
    // The router's dispatchCrew resolves the coordinator through the
    // same registry getter — the session's ctor must register it.
    expect(getActiveCheckpointCoordinator()).toBe(sess.coordinator);
    sess.dispose();
    expect(getActiveCheckpointCoordinator()).toBeNull();
  });
});
