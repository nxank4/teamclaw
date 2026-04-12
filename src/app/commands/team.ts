/**
 * /team command — view and configure team composition.
 * No args → interactive team configuration view.
 * Subcommands: list, info <id>, install <path>, remove <id>
 */
import type { SlashCommand } from "../../tui/index.js";
import { TeamView } from "../interactive/team-view.js";
import { ICONS } from "../../tui/constants/icons.js";

export function createTeamCommand(): SlashCommand {
  return {
    name: "team",
    aliases: ["t", "collab"],
    description: "View and configure team composition",
    args: "[list|info|install|remove] [args]",
    async execute(args, ctx) {
      const parts = args.trim().split(/\s+/);
      const sub = parts[0]?.toLowerCase();

      // No args → interactive mode
      if (!sub) {
        if (ctx.tui) {
          const view = new TeamView(
            ctx.tui,
            (mode, templateId) => {
              const msg = templateId
                ? `${ICONS.success} Team mode: ${mode}, template: ${templateId}`
                : `${ICONS.success} Team mode: ${mode}`;
              ctx.addMessage("system", msg);
            },
            () => { /* closed */ },
          );
          view.activate();
        } else {
          await showTeamList(ctx);
        }
        return;
      }

      if (sub === "list" || sub === "ls") {
        await showTeamList(ctx);
        return;
      }

      if (sub === "info" || sub === "show") {
        const id = parts[1];
        if (!id) {
          ctx.addMessage("error", "Usage: /team info <template-id>");
          return;
        }
        await showTemplateInfo(id, ctx);
        return;
      }

      if (sub === "install") {
        const templatePath = parts[1];
        if (!templatePath) {
          ctx.addMessage("error", "Usage: /team install <path-to-template.json>");
          return;
        }
        await installLocalTemplate(templatePath, ctx);
        return;
      }

      if (sub === "remove" || sub === "uninstall") {
        const id = parts[1];
        if (!id) {
          ctx.addMessage("error", "Usage: /team remove <template-id>");
          return;
        }
        await removeTemplate(id, ctx);
        return;
      }

      ctx.addMessage("error", `Unknown subcommand: /team ${sub}\nUsage: /team [list|info|install|remove]`);
    },
  };
}

async function showTeamList(ctx: { addMessage: (role: string, content: string) => void }): Promise<void> {
  const { listTemplates } = await import("../../templates/template-store.js");
  const { readGlobalConfigWithDefaults } = await import("../../core/global-config.js");

  const templates = await listTemplates();
  const config = readGlobalConfigWithDefaults();
  const activeId = config.team?.templateId;
  const mode = config.team?.mode ?? "autonomous";

  const lines: string[] = [];
  lines.push(`${ICONS.gear} Team Configuration`);
  lines.push(`  Mode: ${mode}`);
  lines.push("");
  lines.push(`  Templates (${templates.length}):`);

  for (const t of templates) {
    const active = t.id === activeId ? "  \u2190 active" : "";
    const builtIn = t.builtIn ? " [built-in]" : "";
    const pipeline = t.pipeline ? t.pipeline.join(" \u2192 ") : t.agents.map((a) => a.role).join(", ");
    const cost = t.estimatedCostPerRun ? ` ~$${t.estimatedCostPerRun.toFixed(2)}/run` : "";
    lines.push(`    ${t.id.padEnd(24)} ${pipeline}${cost}${builtIn}${active}`);
  }

  lines.push("");
  lines.push("  /team to configure \u00b7 /team info <id> for details");
  ctx.addMessage("system", lines.join("\n"));
}

async function showTemplateInfo(id: string, ctx: { addMessage: (role: string, content: string) => void }): Promise<void> {
  const { getTemplate } = await import("../../templates/template-store.js");
  const template = await getTemplate(id);

  if (!template) {
    ctx.addMessage("error", `Template '${id}' not found.`);
    return;
  }

  const lines: string[] = [];
  lines.push(`${ICONS.bolt} ${template.name}`);
  lines.push(`  ID:          ${template.id}`);
  lines.push(`  Description: ${template.description}`);
  lines.push(`  Tags:        ${template.tags.join(", ")}`);
  if (template.estimatedCostPerRun) {
    lines.push(`  Est. cost:   ~$${template.estimatedCostPerRun.toFixed(2)}/run`);
  }
  if (template.pipeline) {
    lines.push(`  Pipeline:    ${template.pipeline.join(" \u2192 ")}`);
  }
  lines.push("");
  lines.push("  Agents:");
  for (const agent of template.agents) {
    const task = agent.task ? ` \u2014 ${agent.task}` : "";
    const model = agent.model ? ` (${agent.model})` : "";
    lines.push(`    \u2022 ${agent.role}${task}${model}`);
  }
  lines.push("");
  ctx.addMessage("system", lines.join("\n"));
}

async function installLocalTemplate(templatePath: string, ctx: { addMessage: (role: string, content: string) => void }): Promise<void> {
  try {
    const { installTemplate } = await import("../../templates/template-store.js");
    await installTemplate(templatePath);
    ctx.addMessage("system", `${ICONS.success} Template installed from ${templatePath}`);
  } catch (err) {
    ctx.addMessage("error", `Failed to install template: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function removeTemplate(id: string, ctx: { addMessage: (role: string, content: string) => void }): Promise<void> {
  const { isSeedTemplate } = await import("../../templates/seeds/index.js");
  if (isSeedTemplate(id)) {
    ctx.addMessage("error", `Cannot remove built-in template '${id}'.`);
    return;
  }

  const { LocalTemplateStore } = await import("../../templates/local-store.js");
  const store = new LocalTemplateStore();
  const removed = await store.uninstall(id);
  if (removed) {
    ctx.addMessage("system", `${ICONS.success} Removed template: ${id}`);
  } else {
    ctx.addMessage("error", `Template '${id}' is not installed.`);
  }
}
