import { describe, it, expect, vi, beforeEach } from "vitest";
import { CoordinatorAgent } from "../src/agents/coordinator.js";
import type { GraphState } from "../src/core/graph-state.js";

describe("CoordinatorAgent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("coordinateNode with user_goal calls LLM and enqueues tasks", async () => {
    const mockTasks = [
      { description: "Implement login", assigned_to: "bot_0", worker_tier: "light" },
      { description: "Add CSS styles", assigned_to: "bot_1", worker_tier: "light" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ response: JSON.stringify(mockTasks) }),
        })
      )
    );

    const team = [
      { id: "bot_0", name: "Dev", role_id: "software_engineer", traits: {} },
      { id: "bot_1", name: "Designer", role_id: "artist", traits: {} },
    ];
    const state: GraphState = {
      team,
      task_queue: [],
      user_goal: "Build a web app",
      bot_stats: {},
      messages: [],
    } as GraphState;

    const agent = new CoordinatorAgent();
    const result = await agent.coordinateNode(state);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/generate"),
      expect.any(Object)
    );
    expect(result.user_goal).toBeNull();
    expect(result.task_queue).toBeDefined();
    const q = result.task_queue as Array<{ description: string; assigned_to: string }>;
    expect(q.length).toBe(2);
    expect(q[0]).toMatchObject({ description: "Implement login", assigned_to: "bot_0" });
    expect(q[1]).toMatchObject({ description: "Add CSS styles", assigned_to: "bot_1" });
    expect(q.every((t) => t.task_id?.startsWith("TASK-"))).toBe(true);
    expect(q.every((t) => t.worker_tier === "light" || t.worker_tier === "heavy")).toBe(true);
  });

  it("coordinateNode defaults missing or invalid worker_tier to light", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              response: JSON.stringify([
                { description: "Task A", assigned_to: "bot_0", worker_tier: "heavy" },
                { description: "Task B", assigned_to: "bot_0" },
                { description: "Task C", assigned_to: "bot_0", worker_tier: "invalid" },
              ]),
            }),
        })
      )
    );
    const team = [
      { id: "bot_0", name: "Dev", role_id: "engineer", traits: {} },
    ];
    const state: GraphState = {
      team,
      task_queue: [],
      user_goal: "Build app",
      bot_stats: {},
      messages: [],
    } as GraphState;

    const agent = new CoordinatorAgent();
    const result = await agent.coordinateNode(state);

    const q = result.task_queue as Array<{ worker_tier: string }>;
    expect(q).toHaveLength(3);
    expect(q[0].worker_tier).toBe("heavy");
    expect(q[1].worker_tier).toBe("light");
    expect(q[2].worker_tier).toBe("light");
  });

  it("coordinateNode without user_goal returns early", async () => {
    const state: GraphState = {
      team: [],
      task_queue: [],
      user_goal: null,
      bot_stats: {},
      messages: [],
    } as GraphState;

    const agent = new CoordinatorAgent();
    const result = await agent.coordinateNode(state);

    expect(fetch).not.toHaveBeenCalled();
    expect(result.last_action).toBe("Coordinator processed");
    expect(result.__node__).toBe("coordinator");
  });

  it("coordinateNode uses fallback when LLM fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false }))
    );

    const team = [{ id: "bot_0", name: "Dev", role_id: "engineer", traits: {} }];
    const state: GraphState = {
      team,
      task_queue: [],
      user_goal: "Build a game",
      bot_stats: {},
      messages: [],
    } as GraphState;

    const agent = new CoordinatorAgent();
    const result = await agent.coordinateNode(state);

    expect(result.task_queue).toBeDefined();
    const q = result.task_queue as Array<Record<string, unknown>>;
    expect(q.length).toBe(1);
    expect(q[0].description).toContain("Build a game");
    expect(q[0].assigned_to).toBe("bot_0");
  });
});
