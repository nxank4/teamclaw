import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ok } from "neverthrow";
import { adaptToolToMcp, adaptAllTools } from "../../src/mcp-server/tool-adapter.js";
import type { ToolDefinition } from "../../src/tools/types.js";

function makeTool(name: string): ToolDefinition {
  return {
    name, displayName: name, description: `Tool ${name}`, category: "file",
    inputSchema: z.object({ path: z.string() }),
    defaultPermission: "auto", riskLevel: "safe", destructive: false, requiresNetwork: false,
    source: "built-in",
    execute: async () => ok({ success: true, data: null, summary: "ok", duration: 0 }),
  };
}

describe("MCP Tool Adapter", () => {
  it("adaptToolToMcp namespaces with openpawl_", () => {
    const spec = adaptToolToMcp(makeTool("file_read"));
    expect(spec.name).toBe("openpawl_file_read");
    expect(spec.description).toContain("file_read");
  });

  it("adaptAllTools filters by whitelist", () => {
    const tools = [makeTool("file_read"), makeTool("shell_exec"), makeTool("git_ops")];
    const specs = adaptAllTools(tools, ["file_read", "git_ops"]);
    expect(specs).toHaveLength(2);
    expect(specs.map((s) => s.name)).toContain("openpawl_file_read");
    expect(specs.map((s) => s.name)).not.toContain("openpawl_shell_exec");
  });

  it("adaptAllTools returns all when no whitelist", () => {
    const tools = [makeTool("a"), makeTool("b")];
    expect(adaptAllTools(tools)).toHaveLength(2);
  });
});
