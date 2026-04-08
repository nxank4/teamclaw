/**
 * Adapt OpenPawl tools → MCP tool format.
 */

import type { ToolDefinition } from "../tools/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";

export interface McpToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export function adaptToolToMcp(tool: ToolDefinition): McpToolSpec {
  let inputSchema: Record<string, unknown>;
  try {
    inputSchema = zodToJsonSchema(tool.inputSchema, { target: "openApi3" }) as Record<string, unknown>;
  } catch {
    inputSchema = { type: "object", properties: {} };
  }

  return {
    name: `openpawl_${tool.name}`,
    description: tool.description,
    inputSchema,
  };
}

export function adaptAllTools(tools: ToolDefinition[], whitelist?: string[]): McpToolSpec[] {
  const filtered = whitelist ? tools.filter((t) => whitelist.includes(t.name)) : tools;
  return filtered.map(adaptToolToMcp);
}
