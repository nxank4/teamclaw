/**
 * Agent config resolver — reads/writes per-agent overrides from global config.
 * Bridges the static agent registry with user-customizable settings.
 */
import { readGlobalConfigWithDefaults, writeGlobalConfig } from "../core/global-config.js";

export interface AgentConfigOverride {
  name?: string;
  description?: string;
  role?: string;
  modelOverride?: string | null;
  temperature?: number;
  maxTurns?: number;
  systemPromptAppend?: string;
  tools?: string[];
  custom?: boolean;
}

const BUILT_IN_IDS = new Set(["planner", "coder", "reviewer", "tester", "debugger", "researcher", "assistant"]);

export function isBuiltInAgent(id: string): boolean {
  return BUILT_IN_IDS.has(id);
}

export function getAgentConfig(agentId: string): AgentConfigOverride | undefined {
  const config = readGlobalConfigWithDefaults();
  return config.agents?.[agentId];
}

export function getAllAgentConfigs(): Record<string, AgentConfigOverride> {
  const config = readGlobalConfigWithDefaults();
  return config.agents ?? {};
}

export function setAgentConfig(agentId: string, override: AgentConfigOverride): void {
  const config = readGlobalConfigWithDefaults();
  const agents = { ...(config.agents ?? {}) };
  agents[agentId] = override;
  config.agents = agents;
  writeGlobalConfig(config);
}

export function deleteAgentConfig(agentId: string): boolean {
  if (isBuiltInAgent(agentId)) return false;
  const config = readGlobalConfigWithDefaults();
  const agents = { ...(config.agents ?? {}) };
  if (!(agentId in agents)) return false;
  delete agents[agentId];
  config.agents = Object.keys(agents).length > 0 ? agents : undefined;

  // Also remove from team customAgents if referenced
  if (config.team?.customAgents) {
    config.team.customAgents = config.team.customAgents.filter((a) => a.role !== agentId);
  }

  writeGlobalConfig(config);
  return true;
}
