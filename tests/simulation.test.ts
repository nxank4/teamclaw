import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTeamOrchestration } from "../src/core/simulation.js";
import type { GraphState } from "../src/core/graph-state.js";

function mockFetchWithTasks(tasks: Array<{ description: string; assigned_to: string; worker_tier: string }>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("/api/tags")) {
        return Promise.resolve({ ok: true });
      }
      if (url.includes("/api/generate")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              response: JSON.stringify(tasks),
            }),
          });
        }
      return Promise.resolve({ ok: false });
    })
  );
}

describe("simulation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchWithTasks([
      { description: "Implement feature", assigned_to: "bot_0", worker_tier: "light" },
    ]);
  });

  it("graph flows coordinator -> worker_execute -> increment_cycle", async () => {
    const team = [
      {
        id: "bot_0",
        name: "Dev",
        role_id: "software_engineer",
        traits: {},
      },
    ];
    const orch = createTeamOrchestration({
      team,
      workerUrls: {},
    });
    const initialState = orch.getInitialState({
      initialTasks: [
        { assigned_to: "bot_0", description: "Quick task" },
      ],
    });

    const config = { configurable: { thread_id: "test-thread-1" } };
    const result = (await orch.graph.invoke(initialState, config)) as GraphState;

    expect(result.cycle_count).toBeGreaterThanOrEqual(1);
    expect(result.task_queue).toBeDefined();
    const completed = (result.task_queue as Array<{ status: string }>).filter(
      (t) => t.status === "completed" || t.status === "failed"
    );
    expect(completed.length).toBeGreaterThanOrEqual(1);
    expect(result.__node__).toBeDefined();
  });

  it("getInitialState merges initialTasks and team correctly", () => {
    const team = [
      { id: "bot_0", name: "A", role_id: "engineer", traits: {} },
    ];
    const orch = createTeamOrchestration({ team });

    const state = orch.getInitialState({
      userGoal: "Build app",
      initialTasks: [
        { assigned_to: "bot_0", description: "Task 1" },
      ],
    });

    expect(state.user_goal).toBe("Build app");
    expect(state.team).toHaveLength(1);
    const q = state.task_queue as Array<Record<string, unknown>>;
    expect(q).toHaveLength(1);
    expect(q[0].description).toBe("Task 1");
    expect(q[0].assigned_to).toBe("bot_0");
    expect(q[0].status).toBe("pending");
  });

  it("stream yields state chunks", async () => {
    const orch = createTeamOrchestration({
      team: [{ id: "bot_0", name: "Dev", role_id: "engineer", traits: {} }],
    });
    const state = orch.getInitialState({
      initialTasks: [{ assigned_to: "bot_0", description: "S" }],
    });

    let count = 0;
    const streamConfig = { streamMode: "values" as const, configurable: { thread_id: "test-thread-2" } };
    for await (const chunk of await orch.graph.stream(state, streamConfig)) {
      count++;
      expect(chunk).toBeDefined();
      expect((chunk as Record<string, unknown>).__node__).toBeDefined();
      if (count >= 5) break;
    }
    expect(count).toBeGreaterThan(0);
  });

  it("coordinator enqueues tasks with worker_tier when LLM returns it", async () => {
    mockFetchWithTasks([
      { description: "Code API", assigned_to: "bot_0", worker_tier: "light" },
      { description: "Click login in browser", assigned_to: "bot_0", worker_tier: "heavy" },
    ]);
    const team = [
      { id: "bot_0", name: "Dev", role_id: "software_engineer", traits: {} },
    ];
    const orch = createTeamOrchestration({ team, workerUrls: {} });
    const state = orch.getInitialState({ userGoal: "Build app with UI test" });
    const afterCoordinator = await orch.coordinator.coordinateNode(state);
    const q = (afterCoordinator.task_queue ?? []) as Array<Record<string, unknown>>;
    expect(q.length).toBe(2);
    expect(q[0].worker_tier).toBe("light");
    expect(q[1].worker_tier).toBe("heavy");
  });

  it("full run with user_goal reaches worker_execute and increment_cycle", async () => {
    mockFetchWithTasks([
      { description: "Task one", assigned_to: "bot_0", worker_tier: "light" },
    ]);
    const team = [
      { id: "bot_0", name: "Dev", role_id: "software_engineer", traits: {} },
    ];
    const orch = createTeamOrchestration({ team, workerUrls: {} });
    const state = orch.getInitialState({ userGoal: "Ship feature" });
    const invokeConfig = { configurable: { thread_id: "test-thread-3" } };
    const result = (await orch.graph.invoke(state, invokeConfig)) as GraphState;
    expect(result.cycle_count).toBeGreaterThanOrEqual(1);
    const q = (result.task_queue ?? []) as Array<Record<string, unknown>>;
    const done = q.filter((t) => t.status === "completed" || t.status === "failed");
    expect(done.length).toBeGreaterThanOrEqual(1);
    expect(q.every((t) => t.worker_tier === "light" || t.worker_tier === "heavy")).toBe(true);
  });
});
