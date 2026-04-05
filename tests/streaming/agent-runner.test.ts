import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentRunner } from "../../src/streaming/agent-runner.js";
import type { LLMStreamProvider } from "../../src/streaming/agent-runner.js";
import { ContextBuilder } from "../../src/streaming/context-builder.js";
import { ToolCallHandler } from "../../src/streaming/tool-call-handler.js";
import { CostTracker } from "../../src/streaming/cost-tracker.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import { PermissionResolver } from "../../src/tools/permissions.js";
import { ToolExecutor } from "../../src/tools/executor.js";
import { Session } from "../../src/session/session.js";
import { createEmptySession } from "../../src/session/session-state.js";
import type { StreamEvent } from "../../src/streaming/types.js";

function createMockProvider(chunks: Array<{ content: string; done: boolean; usage?: { promptTokens: number; completionTokens: number } }>): LLMStreamProvider {
  return {
    async *stream() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

describe("AgentRunner", () => {
  let runner: AgentRunner;
  let session: Session;
  let events: StreamEvent[];

  beforeEach(() => {
    const toolRegistry = new ToolRegistry();
    const contextBuilder = new ContextBuilder(toolRegistry);
    const permissionResolver = new PermissionResolver();
    const toolExecutor = new ToolExecutor(toolRegistry, permissionResolver);
    const toolCallHandler = new ToolCallHandler(toolExecutor, () => {});
    const costTracker = new CostTracker();

    const provider = createMockProvider([
      { content: "Hello ", done: false },
      { content: "world!", done: false },
      { content: "", done: true, usage: { promptTokens: 50, completionTokens: 10 } },
    ]);

    runner = new AgentRunner(provider, contextBuilder, toolCallHandler, costTracker);
    session = new Session(createEmptySession("/tmp/test"));
    events = [];
    runner.on("stream:event", (e: StreamEvent) => events.push(e));
  });

  it("streams tokens from mock provider and emits TokenEvents", async () => {
    const result = await runner.run({
      session,
      sessionId: "s1",
      agentId: "coder",
      agentDefinition: { id: "coder", name: "Coder", description: "", capabilities: [], defaultTools: [], modelTier: "primary", systemPrompt: "", canCollaborate: true, maxConcurrent: 1 },
      prompt: "hello",
      tools: { tools: new Map(), permissions: new Map(), blocked: [] },
    });

    expect(result.isOk()).toBe(true);
    const tokenEvents = events.filter((e) => e.type === "agent:token");
    expect(tokenEvents.length).toBeGreaterThanOrEqual(2);
    expect(result._unsafeUnwrap().content).toBe("Hello world!");
  });

  it("emits AgentStartEvent and AgentDoneEvent", async () => {
    await runner.run({
      session,
      sessionId: "s1",
      agentId: "coder",
      agentDefinition: { id: "coder", name: "Coder", description: "", capabilities: [], defaultTools: [], modelTier: "primary", systemPrompt: "", canCollaborate: true, maxConcurrent: 1 },
      prompt: "test",
      tools: { tools: new Map(), permissions: new Map(), blocked: [] },
    });

    expect(events.some((e) => e.type === "agent:start")).toBe(true);
    expect(events.some((e) => e.type === "agent:done")).toBe(true);
  });

  it("records usage/cost on completion", async () => {
    const result = await runner.run({
      session,
      sessionId: "s1",
      agentId: "coder",
      agentDefinition: { id: "coder", name: "Coder", description: "", capabilities: [], defaultTools: [], modelTier: "primary", systemPrompt: "", canCollaborate: true, maxConcurrent: 1 },
      prompt: "test",
      tools: { tools: new Map(), permissions: new Map(), blocked: [] },
    });

    expect(result.isOk()).toBe(true);
    const r = result._unsafeUnwrap();
    expect(r.inputTokens).toBeGreaterThan(0);
    expect(r.outputTokens).toBeGreaterThan(0);
  });

  it("abort signal stops streaming", async () => {
    const controller = new AbortController();
    controller.abort(); // Abort immediately

    const result = await runner.run({
      session,
      sessionId: "s1",
      agentId: "coder",
      agentDefinition: { id: "coder", name: "Coder", description: "", capabilities: [], defaultTools: [], modelTier: "primary", systemPrompt: "", canCollaborate: true, maxConcurrent: 1 },
      prompt: "test",
      tools: { tools: new Map(), permissions: new Map(), blocked: [] },
      abortSignal: controller.signal,
    });

    // Should succeed with partial/abort result
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().content).toContain("[aborted]");
  });

  it("handles provider error gracefully", async () => {
    const errorProvider: LLMStreamProvider = {
      async *stream() {
        throw new Error("Provider unavailable");
      },
    };

    const toolRegistry = new ToolRegistry();
    const contextBuilder = new ContextBuilder(toolRegistry);
    const toolCallHandler = new ToolCallHandler(new ToolExecutor(toolRegistry, new PermissionResolver()), () => {});
    const errorRunner = new AgentRunner(errorProvider, contextBuilder, toolCallHandler, new CostTracker());

    const result = await errorRunner.run({
      session,
      sessionId: "s1",
      agentId: "coder",
      agentDefinition: { id: "coder", name: "Coder", description: "", capabilities: [], defaultTools: [], modelTier: "primary", systemPrompt: "", canCollaborate: true, maxConcurrent: 1 },
      prompt: "test",
      tools: { tools: new Map(), permissions: new Map(), blocked: [] },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe("provider_error");
  });
});
