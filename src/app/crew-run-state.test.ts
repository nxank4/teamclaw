import { describe, expect, it } from "bun:test";

import {
  addTokens,
  createCrewRunState,
  markAgentBlocked,
  markAgentDone,
  markAgentQueued,
  markAgentRunning,
  markComplete,
} from "./crew-run-state.js";

describe("CrewRunState", () => {
  it("createCrewRunState initializes with empty agents and zero totals", () => {
    const state = createCrewRunState("ship hello.ts");
    expect(state.agents.size).toBe(0);
    expect(state.totalInputTokens).toBe(0);
    expect(state.totalOutputTokens).toBe(0);
    expect(state.goalText).toBe("ship hello.ts");
    expect(state.isComplete).toBe(false);
  });

  it("markAgentRunning transitions queued -> running", () => {
    const state = createCrewRunState("");
    markAgentQueued(state, "coder", "3 tasks");
    expect(state.agents.get("coder")?.status).toBe("queued");
    markAgentRunning(state, "coder");
    expect(state.agents.get("coder")?.status).toBe("running");
  });

  it("markAgentRunning for an unseen agent inserts it as running", () => {
    const state = createCrewRunState("");
    markAgentRunning(state, "tester");
    const entry = state.agents.get("tester");
    expect(entry?.status).toBe("running");
    expect(entry?.inputTokens).toBe(0);
    expect(entry?.outputTokens).toBe(0);
  });

  it("addTokens accumulates per-agent and total across multiple calls", () => {
    const state = createCrewRunState("");
    addTokens(state, "coder", 100, 50);
    addTokens(state, "coder", 30, 70);
    addTokens(state, "tester", 10, 5);
    expect(state.agents.get("coder")?.inputTokens).toBe(130);
    expect(state.agents.get("coder")?.outputTokens).toBe(120);
    expect(state.agents.get("tester")?.inputTokens).toBe(10);
    expect(state.agents.get("tester")?.outputTokens).toBe(5);
    expect(state.totalInputTokens).toBe(140);
    expect(state.totalOutputTokens).toBe(125);
  });

  it("addTokens for an unseen agent auto-inserts as queued", () => {
    const state = createCrewRunState("");
    addTokens(state, "reviewer", 12, 34);
    const entry = state.agents.get("reviewer");
    expect(entry?.status).toBe("queued");
    expect(entry?.inputTokens).toBe(12);
    expect(entry?.outputTokens).toBe(34);
  });

  it("preserves first-seen insertion order in the agents Map", () => {
    const state = createCrewRunState("");
    markAgentQueued(state, "planner");
    markAgentQueued(state, "coder");
    markAgentQueued(state, "reviewer");
    markAgentQueued(state, "tester");
    // Repeat-mark must not reshuffle.
    markAgentRunning(state, "coder");
    markAgentDone(state, "planner", "7 tasks");
    expect([...state.agents.keys()]).toEqual(["planner", "coder", "reviewer", "tester"]);
  });

  it("markComplete flips isComplete and is idempotent", () => {
    const state = createCrewRunState("");
    expect(state.isComplete).toBe(false);
    markComplete(state);
    expect(state.isComplete).toBe(true);
    markComplete(state);
    expect(state.isComplete).toBe(true);
  });

  it("markAgentBlocked sets status and stores reason as metric", () => {
    const state = createCrewRunState("");
    markAgentBlocked(state, "coder", "missing tool: shell_exec");
    const entry = state.agents.get("coder");
    expect(entry?.status).toBe("blocked");
    expect(entry?.metric).toBe("missing tool: shell_exec");
  });

  it("markAgentDone overwrites metric (e.g. with summary)", () => {
    const state = createCrewRunState("");
    markAgentQueued(state, "coder", "3 tasks");
    markAgentRunning(state, "coder");
    markAgentDone(state, "coder", "3/3 done");
    expect(state.agents.get("coder")?.metric).toBe("3/3 done");
    expect(state.agents.get("coder")?.status).toBe("done");
  });
});
