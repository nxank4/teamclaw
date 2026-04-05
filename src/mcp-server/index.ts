/**
 * MCP server — expose OpenPawl tools and agents.
 */

export type { McpServerConfig, McpToolResponse } from "./types.js";
export { adaptToolToMcp, adaptAllTools } from "./tool-adapter.js";
export type { McpToolSpec } from "./tool-adapter.js";
export { adaptAgentToMcp, adaptAllAgents } from "./agent-adapter.js";
