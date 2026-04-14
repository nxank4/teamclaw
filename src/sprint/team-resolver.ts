/**
 * Resolve team context from config or template override for sprint mode.
 */
import type { SprintTeamContext } from "./types.js";
import { readGlobalConfigWithDefaults } from "../core/global-config.js";
import { getTemplate } from "../templates/template-store.js";

/**
 * Map a free-form template role name to a built-in agent ID.
 * Template roles like "architect", "qa-engineer", "frontend-engineer"
 * get mapped to the fixed set: planner, coder, tester, reviewer, debugger, researcher.
 */
export function mapTemplateRoleToAgent(role: string): string {
  const lower = role.toLowerCase();
  // Split on hyphens/underscores/spaces into tokens for matching
  const tokens = lower.split(/[-_\s]+/);

  // Planner/architect roles
  if (tokens.some((t) => ["architect", "planner", "design", "analyst", "process"].includes(t))) return "planner";

  // Tester roles
  if (tokens.some((t) => ["test", "tester", "qa", "spec", "verify"].includes(t))) return "tester";

  // Reviewer roles
  if (tokens.some((t) => ["review", "reviewer", "audit", "lead", "check", "rfc", "document", "documentation"].includes(t))) return "reviewer";

  // Debugger roles
  if (tokens.some((t) => ["debug", "debugger", "fix", "bug"].includes(t))) return "debugger";

  // Researcher roles
  if (tokens.some((t) => ["research", "researcher", "investigate", "fact", "synthesize", "synthesizer"].includes(t))) return "researcher";

  // Everything else (engineer, coder, frontend, backend, devops, etc.)
  return "coder";
}

/**
 * Resolve team context from global config.
 * Returns undefined for autonomous mode (default behavior).
 */
export async function resolveTeamContext(): Promise<SprintTeamContext | undefined> {
  const config = readGlobalConfigWithDefaults();
  const team = config.team;
  if (!team) return undefined;

  if (team.mode === "template" && team.templateId) {
    return resolveFromTemplate(team.templateId);
  }

  if (team.mode === "manual" && team.customAgents && team.customAgents.length > 0) {
    return {
      templateId: "manual",
      templateName: "Custom Team",
      pipeline: team.customAgents.map((a) => a.role),
      agents: team.customAgents.map((a) => ({
        role: a.role,
        task: a.task,
      })),
      mode: "manual",
    };
  }

  return undefined;
}

/**
 * Build team context from a specific template ID.
 * Used for --template flag override.
 */
export async function resolveFromTemplate(templateId: string): Promise<SprintTeamContext | undefined> {
  const template = await getTemplate(templateId);
  if (!template) return undefined;

  return {
    templateId: template.id,
    templateName: template.name,
    pipeline: template.pipeline ?? template.agents.map((a) => a.role),
    agents: template.agents.map((a) => ({
      role: a.role,
      task: a.task,
    })),
    mode: "template",
  };
}
