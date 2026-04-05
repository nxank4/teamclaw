import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { ok, err } from "neverthrow";
import { ToolCallHandler } from "../../src/streaming/tool-call-handler.js";
import { ToolExecutor } from "../../src/tools/executor.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import { PermissionResolver } from "../../src/tools/permissions.js";
import type { ToolDefinition, ToolExecutionContext } from "../../src/tools/types.js";
import type { StreamEvent } from "../../src/streaming/types.js";

function makeTool(name: string, result?: { success: boolean; summary: string }): ToolDefinition {
  return {
    name,
    displayName: name,
    description: name,
    category: "file",
    inputSchema: z.object({ path: z.string() }),
    defaultPermission: "auto",
    riskLevel: "safe",
    destructive: false,
    requiresNetwork: false,
    source: "built-in",
    execute: async () => ok({
      success: result?.success ?? true,
      data: null,
      summary: result?.summary ?? "done",
      duration: 5,
    }),
  };
}

describe("ToolCallHandler", () => {
  it("parseToolCalls extracts tool calls from text", () => {
    const handler = new ToolCallHandler(
      new ToolExecutor(new ToolRegistry(), new PermissionResolver()),
      () => {},
    );

    const text = 'Here is some text\n```tool_call\n{"name": "file_read", "input": {"path": "src/index.ts"}}\n```\nMore text';
    const calls = handler.parseToolCalls(text);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe("file_read");
    expect(JSON.parse(calls[0]!.arguments)).toEqual({ path: "src/index.ts" });
  });

  it("stripToolCalls removes tool_call blocks", () => {
    const handler = new ToolCallHandler(
      new ToolExecutor(new ToolRegistry(), new PermissionResolver()),
      () => {},
    );

    const text = 'Before\n```tool_call\n{"name": "test"}\n```\nAfter';
    const stripped = handler.stripToolCalls(text);
    expect(stripped).toContain("Before");
    expect(stripped).toContain("After");
    expect(stripped).not.toContain("tool_call");
  });

  it("handles valid tool call successfully", async () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("file_read"));
    const executor = new ToolExecutor(registry, new PermissionResolver());
    const events: StreamEvent[] = [];
    const handler = new ToolCallHandler(executor, (e) => events.push(e));

    const ctx: ToolExecutionContext = { agentId: "coder", sessionId: "s1", workingDirectory: "/tmp" };
    const result = await handler.handleToolCalls(
      [{ id: "c1", name: "file_read", arguments: '{"path": "test.txt"}' }],
      ctx,
      "s1",
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toHaveLength(1);
    expect(result._unsafeUnwrap()[0]!.success).toBe(true);
    expect(events.some((e) => e.type === "tool:start")).toBe(true);
    expect(events.some((e) => e.type === "tool:done")).toBe(true);
  });

  it("handles malformed JSON arguments", async () => {
    const executor = new ToolExecutor(new ToolRegistry(), new PermissionResolver());
    const handler = new ToolCallHandler(executor, () => {});

    const ctx: ToolExecutionContext = { agentId: "coder", sessionId: "s1", workingDirectory: "/tmp" };
    const result = await handler.handleToolCalls(
      [{ id: "c1", name: "file_read", arguments: "not json{{{" }],
      ctx,
      "s1",
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()[0]!.success).toBe(false);
    expect(result._unsafeUnwrap()[0]!.outputSummary).toContain("Malformed");
  });

  it("handles tool execution failure", async () => {
    const registry = new ToolRegistry();
    registry.register({
      ...makeTool("failing"),
      execute: async () => err({ type: "execution_failed", toolName: "failing", cause: "boom" }),
    });
    const executor = new ToolExecutor(registry, new PermissionResolver());
    const handler = new ToolCallHandler(executor, () => {});

    const ctx: ToolExecutionContext = { agentId: "coder", sessionId: "s1", workingDirectory: "/tmp" };
    const result = await handler.handleToolCalls(
      [{ id: "c1", name: "failing", arguments: '{"path": "x"}' }],
      ctx,
      "s1",
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()[0]!.success).toBe(false);
  });

  it("emits correct events during tool execution", async () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("test_tool"));
    const executor = new ToolExecutor(registry, new PermissionResolver());
    const events: StreamEvent[] = [];
    const handler = new ToolCallHandler(executor, (e) => events.push(e));

    const ctx: ToolExecutionContext = { agentId: "coder", sessionId: "s1", workingDirectory: "/tmp" };
    await handler.handleToolCalls(
      [{ id: "c1", name: "test_tool", arguments: '{"path": "a"}' }],
      ctx,
      "s1",
    );

    const types = events.map((e) => e.type);
    expect(types).toContain("tool:start");
    expect(types).toContain("tool:done");
  });

  it("toRecords converts results correctly", () => {
    const handler = new ToolCallHandler(
      new ToolExecutor(new ToolRegistry(), new PermissionResolver()),
      () => {},
    );

    const records = handler.toRecords([
      { callId: "c1", toolName: "file_read", success: true, outputSummary: "Read ok", duration: 10, responseMessage: { role: "tool", content: "ok" } },
    ]);

    expect(records).toHaveLength(1);
    expect(records[0]!.toolName).toBe("file_read");
    expect(records[0]!.success).toBe(true);
  });
});
