/**
 * MCP server types.
 */

export interface McpServerConfig {
  port: number;
  host: string;
  authToken?: string;
  exposedTools?: string[];
  exposedAgents?: string[];
}

export interface McpToolResponse {
  content: Array<{ type: "text"; text: string }>;
}
