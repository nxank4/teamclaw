/**
 * /agents command — view and manage agent configurations.
 * No args → interactive agents view.
 */
import type { SlashCommand } from "../../tui/index.js";
import { AgentsView } from "../interactive/agents-view.js";
import { ICONS } from "../../tui/constants/icons.js";

export function createAgentsCommand(): SlashCommand {
  return {
    name: "agents",
    aliases: [],
    description: "View and manage agent configurations",
    args: "",
    async execute(_args, ctx) {
      if (ctx.tui) {
        const view = new AgentsView(ctx.tui, () => { /* closed */ });
        view.activate();
        return;
      }

      // Fallback: static list
      const { AgentRegistry } = await import("../../router/agent-registry.js");
      const { getAllAgentConfigs, isBuiltInAgent } = await import("../../router/agent-config.js");

      const registry = new AgentRegistry();
      const builtIn = registry.getAll();
      const configs = getAllAgentConfigs();

      const lines: string[] = [`${ICONS.bolt} Agents`, ""];
      for (const agent of builtIn) {
        const override = configs[agent.id];
        const name = override?.name ?? agent.name;
        const desc = override?.description ?? agent.description;
        lines.push(`  ${agent.id.padEnd(14)} ${name.padEnd(16)} ${desc}`);
      }

      // Custom agents
      for (const [id, cfg] of Object.entries(configs)) {
        if (isBuiltInAgent(id)) continue;
        if (!cfg.custom) continue;
        lines.push(`  ${id.padEnd(14)} ${(cfg.name ?? id).padEnd(16)} ${cfg.description ?? ""} (custom)`);
      }

      lines.push("");
      lines.push("  /agents to manage");
      ctx.addMessage("system", lines.join("\n"));
    },
  };
}
