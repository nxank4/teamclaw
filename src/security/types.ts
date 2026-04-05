/**
 * Security types for prompt injection defense.
 */

export type ContentSource = "file" | "web" | "tool_output" | "mcp" | "user";

export interface InjectionAlert {
  severity: "low" | "medium" | "high" | "critical";
  pattern: string;
  position: number;
  snippet: string;
  recommendation: string;
}

export interface IsolationAlert {
  type: "cross_agent_instruction" | "prompt_override" | "tool_escalation";
  agentId: string;
  detail: string;
}

export interface ChainAlert {
  pattern: string;
  severity: "warning" | "block";
  toolNames: string[];
  description: string;
}
