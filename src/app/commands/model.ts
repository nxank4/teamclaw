/**
 * /model command — show or change current model.
 * No args → interactive model picker.
 * With args → set model directly.
 */
import type { SlashCommand } from "../../tui/index.js";
import { ModelView } from "../interactive/model-view.js";

export function createModelCommand(): SlashCommand {
  return {
    name: "model",
    aliases: ["m"],
    description: "Show or change current model",
    args: "[model-name]",
    async execute(args, ctx) {
      const { getModelConfig } = await import("../../core/model-config.js");

      if (!args.trim()) {
        // Interactive mode
        if (ctx.tui) {
          const config = getModelConfig();
          const current = config.defaultModel || "";
          const view = new ModelView(
            ctx.tui,
            current,
            async (model) => {
              const { setConfigValue } = await import("../../core/configManager.js");
              const result = setConfigValue("model", model);
              if ("error" in result) {
                ctx.addMessage("error", result.error);
              } else {
                ctx.addMessage("system", `\u2713 Model set to: ${model}`);
              }
            },
            () => { /* closed */ },
          );
          view.activate();
          return;
        }

        // Fallback: static display
        const config = getModelConfig();
        const lines = [
          `**Current model:** ${config.defaultModel || "(not set)"}`,
        ];
        if (Object.keys(config.agentModels).length > 0) {
          lines.push("", "**Per-agent models:**");
          for (const [role, model] of Object.entries(config.agentModels)) {
            lines.push(`  ${role}: ${model}`);
          }
        }
        if (config.fallbackChain.length > 0) {
          lines.push("", `**Fallback chain:** ${config.fallbackChain.join(" \u2192 ")}`);
        }
        ctx.addMessage("system", lines.join("\n"));
        return;
      }

      // Set model directly
      const { setConfigValue } = await import("../../core/configManager.js");
      const result = setConfigValue("model", args.trim());
      if ("error" in result) {
        ctx.addMessage("error", result.error);
      } else {
        ctx.addMessage("system", `\u2713 Model set to: ${args.trim()}`);
      }
    },
  };
}
