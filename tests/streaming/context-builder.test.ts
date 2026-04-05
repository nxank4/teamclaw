import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ok } from "neverthrow";
import { ContextBuilder } from "../../src/streaming/context-builder.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import { Session } from "../../src/session/session.js";
import { createEmptySession } from "../../src/session/session-state.js";
import type { ToolDefinition } from "../../src/tools/types.js";

function makeTool(name: string): ToolDefinition {
  return {
    name,
    displayName: name,
    description: `Test tool ${name}`,
    category: "file",
    inputSchema: z.object({ path: z.string() }),
    defaultPermission: "auto",
    riskLevel: "safe",
    destructive: false,
    requiresNetwork: false,
    source: "built-in",
    execute: async () => ok({ success: true, data: null, summary: "ok", duration: 0 }),
  };
}

describe("ContextBuilder", () => {
  it("builds messages with system prompt + history + prompt", () => {
    const registry = new ToolRegistry();
    const builder = new ContextBuilder(registry);
    const session = new Session(createEmptySession("/tmp/test"));

    const result = builder.build({
      session,
      agentId: "coder",
      agentSystemPrompt: "You are a coder.",
      prompt: "Write hello world",
      tools: [],
    });

    expect(result.isOk()).toBe(true);
    const ctx = result._unsafeUnwrap();
    expect(ctx.messages.length).toBeGreaterThanOrEqual(2); // system + user
    expect(ctx.messages[0]!.role).toBe("system");
    expect(ctx.messages[0]!.content).toContain("coder");
    expect(ctx.messages[ctx.messages.length - 1]!.role).toBe("user");
    expect(ctx.messages[ctx.messages.length - 1]!.content).toBe("Write hello world");
  });

  it("includes tool schemas in context", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("file_read"));
    registry.register(makeTool("file_write"));
    const builder = new ContextBuilder(registry);
    const session = new Session(createEmptySession("/tmp/test"));

    const result = builder.build({
      session,
      agentId: "coder",
      agentSystemPrompt: "You are a coder.",
      prompt: "Read the file",
      tools: ["file_read", "file_write"],
    });

    expect(result.isOk()).toBe(true);
    const ctx = result._unsafeUnwrap();
    expect(ctx.toolSchemas).toHaveLength(2);
    expect(ctx.messages[0]!.content).toContain("tool_call");
    expect(ctx.messages[0]!.content).toContain("file_read");
  });

  it("includes additional context for sequential dispatch", () => {
    const registry = new ToolRegistry();
    const builder = new ContextBuilder(registry);
    const session = new Session(createEmptySession("/tmp/test"));

    const result = builder.build({
      session,
      agentId: "reviewer",
      agentSystemPrompt: "You review code.",
      prompt: "Review this",
      tools: [],
      additionalContext: "Previous agent output: the code is fine",
    });

    expect(result.isOk()).toBe(true);
    const ctx = result._unsafeUnwrap();
    const hasAdditional = ctx.messages.some((m) => m.content.includes("Previous agent output"));
    expect(hasAdditional).toBe(true);
  });

  it("estimates token count", () => {
    const registry = new ToolRegistry();
    const builder = new ContextBuilder(registry);
    const session = new Session(createEmptySession("/tmp/test"));

    const result = builder.build({
      session,
      agentId: "coder",
      agentSystemPrompt: "System prompt.",
      prompt: "Hello",
      tools: [],
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().estimatedTokens).toBeGreaterThan(0);
  });
});
