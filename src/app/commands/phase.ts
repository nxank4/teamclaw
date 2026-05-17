/**
 * /phase slash command.
 *
 * Renders the session's current phase, linked artefact paths, and the
 * transition history (timestamp + trigger + resulting phase) as a
 * system message.
 */

import { ICONS } from "../../tui/constants/icons.js";
import type { SlashCommand } from "../../tui/slash/registry.js";

import type { SpecPlanCommandDeps } from "./spec.js";

export function createPhaseCommand(deps: SpecPlanCommandDeps): SlashCommand {
  return {
    name: "phase",
    description: "Show current spec/plan phase + transition history",
    async execute(_args, ctx) {
      const session = deps.appCtx.chatSession;
      if (!session) {
        ctx.addMessage("error", "No active session.");
        return;
      }
      const phase = session.getPhase();
      const lines: string[] = [
        `${ICONS.bolt} Session phase: ${phase.currentPhase}`,
        "",
        `  spec: ${phase.currentSpecPath ?? "—"}`,
        `  plan: ${phase.currentPlanPath ?? "—"}`,
      ];
      if (phase.history.length > 0) {
        lines.push("");
        lines.push("  history:");
        for (const entry of phase.history) {
          lines.push(`    ${entry.at}  ${entry.trigger.padEnd(18)} → ${entry.phase}`);
        }
      }
      ctx.addMessage("system", lines.join("\n"));
    },
  };
}
