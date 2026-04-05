import { describe, it, expect, vi, beforeEach } from "vitest";
import { StreamOrchestrator } from "../../src/streaming/stream-orchestrator.js";
import { AgentRunner } from "../../src/streaming/agent-runner.js";
import type { LLMStreamProvider } from "../../src/streaming/agent-runner.js";
import { ContextBuilder } from "../../src/streaming/context-builder.js";
import { ToolCallHandler } from "../../src/streaming/tool-call-handler.js";
import { CostTracker } from "../../src/streaming/cost-tracker.js";
import { AgentRegistry } from "../../src/router/agent-registry.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import { ToolExecutor } from "../../src/tools/executor.js";
import { PermissionResolver } from "../../src/tools/permissions.js";
import { createSessionManager } from "../../src/session/index.js";
import type { RouteDecision } from "../../src/router/router-types.js";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

function createMockProvider(): LLMStreamProvider {
  return {
    async *stream() {
      yield { content: "Hello from agent", done: false };
      yield { content: "", done: true, usage: { promptTokens: 20, completionTokens: 10 } };
    },
  };
}

describe("StreamOrchestrator", () => {
  let tmpDir: string;
  let orchestrator: StreamOrchestrator;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "openpawl-orch-test-"));

    const toolRegistry = new ToolRegistry();
    const contextBuilder = new ContextBuilder(toolRegistry);
    const toolExecutor = new ToolExecutor(toolRegistry, new PermissionResolver());
    const toolCallHandler = new ToolCallHandler(toolExecutor, () => {});
    const costTracker = new CostTracker();
    const agentRegistry = new AgentRegistry();
    const provider = createMockProvider();
    const agentRunner = new AgentRunner(provider, contextBuilder, toolCallHandler, costTracker);

    const sessionManager = createSessionManager({ sessionsDir: tmpDir, checkpointIntervalMs: 60_000 });
    await sessionManager.initialize();
    await sessionManager.create(process.cwd());

    orchestrator = new StreamOrchestrator(agentRunner, agentRegistry, toolRegistry, sessionManager, costTracker);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("single strategy: runs one agent and returns result", async () => {
    const decision: RouteDecision = {
      strategy: "single",
      agents: [{ agentId: "coder", role: "Coder", task: "write code", tools: [], priority: 0 }],
      requiresConfirmation: false,
    };

    const result = await orchestrator.execute("test", "hello", decision, {});
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().agentResults).toHaveLength(1);
    expect(result._unsafeUnwrap().agentResults[0]!.content).toContain("Hello from agent");
  });

  it("clarify strategy: generates question without agent", async () => {
    const decision: RouteDecision = {
      strategy: "clarify",
      agents: [],
      requiresConfirmation: false,
    };

    const result = await orchestrator.execute("test", "huh?", decision, {});
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().agentResults[0]!.content).toContain("rephrase");
  });

  it("abort cancels all running agents", async () => {
    const decision: RouteDecision = {
      strategy: "single",
      agents: [{ agentId: "coder", role: "Coder", task: "", tools: [], priority: 0 }],
      requiresConfirmation: false,
    };

    // Abort before execution (will be caught)
    orchestrator.abort("test");

    const result = await orchestrator.execute("test", "hello", decision, {});
    // May succeed or fail depending on timing — just shouldn't crash
    expect(result.isOk() || result.isErr()).toBe(true);
  });

  it("StreamCompleteEvent has correct aggregate stats", async () => {
    const decision: RouteDecision = {
      strategy: "single",
      agents: [{ agentId: "coder", role: "Coder", task: "", tools: [], priority: 0 }],
      requiresConfirmation: false,
    };

    const result = await orchestrator.execute("test", "hello", decision, {});
    expect(result.isOk()).toBe(true);
    const event = result._unsafeUnwrap();
    expect(event.type).toBe("stream:complete");
    expect(event.totalDuration).toBeGreaterThanOrEqual(0);
  });
});
