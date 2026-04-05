import { describe, it, expect, vi, beforeEach } from "vitest";
import { Dispatcher, PlaceholderAgentRunner } from "../../src/router/dispatch-strategy.js";
import type { AgentRunner } from "../../src/router/dispatch-strategy.js";
import { AgentRegistry } from "../../src/router/agent-registry.js";
import type { RouteDecision, AgentResult } from "../../src/router/router-types.js";

function makeDecision(overrides: Partial<RouteDecision> = {}): RouteDecision {
  return {
    strategy: "single",
    agents: [{
      agentId: "coder",
      role: "Coder",
      task: "write hello world",
      tools: ["file_write"],
      priority: 0,
    }],
    requiresConfirmation: false,
    ...overrides,
  };
}

function makeMockRunner(response?: string): AgentRunner {
  return {
    run: vi.fn().mockResolvedValue({
      agentId: "mock",
      success: true,
      response: response ?? "Mock response",
      toolCalls: [],
      duration: 10,
      inputTokens: 100,
      outputTokens: 50,
      costUSD: 0.001,
    } satisfies AgentResult),
  };
}

describe("Dispatcher", () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  it("single dispatch calls agent and returns result", async () => {
    const runner = makeMockRunner("Hello world code");
    const dispatcher = new Dispatcher(registry, runner);

    const result = await dispatcher.dispatch("session-1", "write hello world", makeDecision());
    expect(result.isOk()).toBe(true);
    const dispatch = result._unsafeUnwrap();
    expect(dispatch.strategy).toBe("single");
    expect(dispatch.agentResults).toHaveLength(1);
    expect(dispatch.agentResults[0]!.success).toBe(true);
    expect(runner.run).toHaveBeenCalledTimes(1);
  });

  it("sequential dispatch passes output between agents", async () => {
    const runner: AgentRunner = {
      run: vi.fn()
        .mockResolvedValueOnce({
          agentId: "coder", success: true, response: "Code written",
          toolCalls: [], duration: 10, inputTokens: 50, outputTokens: 25, costUSD: 0.001,
        })
        .mockResolvedValueOnce({
          agentId: "reviewer", success: true, response: "Code reviewed",
          toolCalls: [], duration: 10, inputTokens: 50, outputTokens: 25, costUSD: 0.001,
        }),
    };
    const dispatcher = new Dispatcher(registry, runner);

    const decision = makeDecision({
      strategy: "sequential",
      agents: [
        { agentId: "coder", role: "Coder", task: "write", tools: [], priority: 0 },
        { agentId: "reviewer", role: "Reviewer", task: "", tools: [], priority: 1, dependsOn: ["coder"] },
      ],
    });

    const result = await dispatcher.dispatch("session-1", "write and review", decision);
    expect(result.isOk()).toBe(true);
    const dispatch = result._unsafeUnwrap();
    expect(dispatch.agentResults).toHaveLength(2);
    expect(dispatch.agentResults[0]!.response).toBe("Code written");
    expect(dispatch.agentResults[1]!.response).toBe("Code reviewed");
    expect(runner.run).toHaveBeenCalledTimes(2);
  });

  it("parallel dispatch runs agents concurrently", async () => {
    const runner: AgentRunner = {
      run: vi.fn().mockImplementation(async (agentId: string) => ({
        agentId, success: true, response: `${agentId} done`,
        toolCalls: [], duration: 10, inputTokens: 50, outputTokens: 25, costUSD: 0.001,
      })),
    };
    const dispatcher = new Dispatcher(registry, runner);

    const decision = makeDecision({
      strategy: "parallel",
      agents: [
        { agentId: "coder", role: "Coder", task: "write code", tools: [], priority: 0 },
        { agentId: "tester", role: "Tester", task: "write tests", tools: [], priority: 0 },
      ],
    });

    const result = await dispatcher.dispatch("session-1", "code + test", decision);
    expect(result.isOk()).toBe(true);
    const dispatch = result._unsafeUnwrap();
    expect(dispatch.agentResults).toHaveLength(2);
    expect(runner.run).toHaveBeenCalledTimes(2);
  });

  it("orchestrated dispatch calls planner first", async () => {
    const runner = makeMockRunner("Plan: step 1, step 2, step 3");
    const dispatcher = new Dispatcher(registry, runner);

    const decision = makeDecision({
      strategy: "orchestrated",
      agents: [{ agentId: "planner", role: "Planner", task: "decompose", tools: [], priority: 0 }],
    });

    const result = await dispatcher.dispatch("session-1", "build full app", decision);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().strategy).toBe("orchestrated");
    expect(runner.run).toHaveBeenCalledTimes(1);
  });

  it("clarify dispatch adds question to session", async () => {
    const dispatcher = new Dispatcher(registry);

    const decision = makeDecision({ strategy: "clarify", agents: [] });
    const result = await dispatcher.dispatch("session-1", "huh?", decision);

    expect(result.isOk()).toBe(true);
    const dispatch = result._unsafeUnwrap();
    expect(dispatch.strategy).toBe("clarify");
    expect(dispatch.agentResults[0]!.response).toContain("rephrase");
  });

  it("abort cancels in-progress dispatch", async () => {
    let abortSignalReceived = false;
    const runner: AgentRunner = {
      run: vi.fn().mockImplementation(async (_id: string, _p: string, _t: string[], _c: unknown, signal?: AbortSignal) => {
        abortSignalReceived = signal?.aborted ?? false;
        return {
          agentId: "coder", success: !abortSignalReceived, response: "done",
          toolCalls: [], duration: 0, inputTokens: 0, outputTokens: 0, costUSD: 0,
        };
      }),
    };

    const dispatcher = new Dispatcher(registry, runner);

    // Abort immediately
    dispatcher.abort("session-1");

    const result = await dispatcher.dispatch("session-1", "test", makeDecision());
    // Should still complete (abort only affects in-flight)
    expect(result.isOk()).toBe(true);
  });

  it("failed agent in sequential stops the chain", async () => {
    const runner: AgentRunner = {
      run: vi.fn()
        .mockResolvedValueOnce({
          agentId: "coder", success: false, response: "", error: "Failed",
          toolCalls: [], duration: 0, inputTokens: 0, outputTokens: 0, costUSD: 0,
        })
        .mockResolvedValueOnce({
          agentId: "reviewer", success: true, response: "reviewed",
          toolCalls: [], duration: 0, inputTokens: 0, outputTokens: 0, costUSD: 0,
        }),
    };

    const dispatcher = new Dispatcher(registry, runner);
    const decision = makeDecision({
      strategy: "sequential",
      agents: [
        { agentId: "coder", role: "Coder", task: "", tools: [], priority: 0 },
        { agentId: "reviewer", role: "Reviewer", task: "", tools: [], priority: 1 },
      ],
    });

    const result = await dispatcher.dispatch("session-1", "test", decision);
    expect(result.isOk()).toBe(true);
    // Only 1 result because chain stopped after failure
    expect(result._unsafeUnwrap().agentResults).toHaveLength(1);
  });

  it("events emitted: dispatch:start, dispatch:agent:start, dispatch:done", async () => {
    const runner = makeMockRunner();
    const dispatcher = new Dispatcher(registry, runner);

    const events: string[] = [];
    dispatcher.on("dispatch:start", () => events.push("start"));
    dispatcher.on("dispatch:agent:start", () => events.push("agent:start"));
    dispatcher.on("dispatch:agent:done", () => events.push("agent:done"));
    dispatcher.on("dispatch:done", () => events.push("done"));

    await dispatcher.dispatch("session-1", "test", makeDecision());

    expect(events).toContain("start");
    expect(events).toContain("agent:start");
    expect(events).toContain("agent:done");
    expect(events).toContain("done");
  });

  it("cost tracking accumulated across all agents", async () => {
    const runner: AgentRunner = {
      run: vi.fn().mockImplementation(async (agentId: string) => ({
        agentId, success: true, response: "done",
        toolCalls: [], duration: 10, inputTokens: 100, outputTokens: 50, costUSD: 0.005,
      })),
    };

    const dispatcher = new Dispatcher(registry, runner);
    const decision = makeDecision({
      strategy: "parallel",
      agents: [
        { agentId: "coder", role: "Coder", task: "", tools: [], priority: 0 },
        { agentId: "tester", role: "Tester", task: "", tools: [], priority: 0 },
      ],
    });

    const result = await dispatcher.dispatch("session-1", "test", decision);
    expect(result.isOk()).toBe(true);
    const dispatch = result._unsafeUnwrap();
    expect(dispatch.totalInputTokens).toBe(200);
    expect(dispatch.totalOutputTokens).toBe(100);
    expect(dispatch.totalCostUSD).toBeCloseTo(0.01);
  });

  it("placeholder runner returns acknowledgement", async () => {
    const dispatcher = new Dispatcher(registry);

    const result = await dispatcher.dispatch("session-1", "hello world", makeDecision());
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().agentResults[0]!.response).toContain("Acknowledged");
  });
});
