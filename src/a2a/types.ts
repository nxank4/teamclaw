/**
 * A2A (Agent-to-Agent) protocol types.
 */

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: { streaming: boolean; pushNotifications: boolean };
  skills: AgentSkill[];
  authentication: { schemes: string[] };
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

export interface A2ATask {
  id: string;
  status: "submitted" | "working" | "completed" | "failed";
  skill: string;
  artifacts?: Array<{ type: string; text: string; metadata?: Record<string, unknown> }>;
  createdAt: string;
}

export interface A2AConfig {
  baseUrl: string;
  version: string;
  authRequired: boolean;
}
