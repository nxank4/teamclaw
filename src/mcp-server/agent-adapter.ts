/**
 * Expose agents as callable MCP tools.
 */

import type { AgentDefinition } from "../router/router-types.js";
import type { McpToolSpec } from "./tool-adapter.js";

export function adaptAgentToMcp(agent: AgentDefinition): McpToolSpec {
  return {
    name: `openpawl_agent_${agent.id}`,
    description: `Send task to ${agent.name} agent. ${agent.description}`,
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "What to ask the agent" },
        context: { type: "string", description: "Additional context (optional)" },
      },
      required: ["prompt"],
    },
  };
}

export function adaptAllAgents(agents: AgentDefinition[], whitelist?: string[]): McpToolSpec[] {
  const filtered = whitelist ? agents.filter((a) => whitelist.includes(a.id)) : agents;
  return filtered.map(adaptAgentToMcp);
}
