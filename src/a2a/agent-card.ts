/**
 * Generate /.well-known/agent.json for A2A discovery.
 */

import type { AgentDefinition } from "../router/router-types.js";
import type { AgentCard, A2AConfig } from "./types.js";

export function generateAgentCard(agents: AgentDefinition[], config: A2AConfig): AgentCard {
  const skills = agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    tags: agent.capabilities,
  }));

  return {
    name: "OpenPawl",
    description: "Multi-agent AI coding assistant. Routes tasks to specialized agents.",
    url: `${config.baseUrl}/a2a`,
    version: config.version,
    capabilities: { streaming: true, pushNotifications: false },
    skills,
    authentication: { schemes: config.authRequired ? ["bearer"] : [] },
  };
}
