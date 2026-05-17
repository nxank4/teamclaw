/**
 * /abandon slash command.
 *
 * Transitions the session phase to `abandoned` from any non-terminal
 * state. Flips the linked spec/plan frontmatter status to `abandoned`
 * on disk so future readers see the artefact was given up on rather
 * than deleted. Clears pendingPhaseConfirmation so the next prompt
 * starts fresh.
 *
 * Errors when the session is already in a terminal state (done /
 * abandoned).
 */

import { loadPlanFromFile } from "../../plans/loader.js";
import { writePlan } from "../../plans/writer.js";
import { isTerminal, transition } from "../../session/phase-machine.js";
import { loadSpecFromFile } from "../../spec/loader.js";
import { writeSpec } from "../../spec/writer.js";
import { ICONS } from "../../tui/constants/icons.js";
import type { SlashCommand } from "../../tui/slash/registry.js";

import type { SpecPlanCommandDeps } from "./spec.js";

export function createAbandonCommand(deps: SpecPlanCommandDeps): SlashCommand {
  return {
    name: "abandon",
    description: "Abandon the current spec/plan workflow — sets phase + frontmatter to abandoned",
    async execute(_args, ctx) {
      const session = deps.appCtx.chatSession;
      if (!session) {
        ctx.addMessage("error", "No active session.");
        return;
      }
      const phase = session.getPhase();
      if (isTerminal(phase.currentPhase)) {
        ctx.addMessage("error", `Session is already in terminal phase '${phase.currentPhase}'.`);
        return;
      }

      session.setPhase(transition(phase.currentPhase, "abandon"), "abandon");
      deps.appCtx.pendingPhaseConfirmation = null;

      // Flip frontmatter on disk so future /specs / /plans listings
      // show this abandonment rather than a stale 'draft'.
      if (phase.currentPlanPath) {
        const doc = await loadPlanFromFile(phase.currentPlanPath);
        if (doc.frontmatter.status !== "abandoned") {
          await writePlan({ ...doc, frontmatter: { ...doc.frontmatter, status: "abandoned" } });
        }
      }
      if (phase.currentSpecPath) {
        const doc = await loadSpecFromFile(phase.currentSpecPath);
        if (doc.frontmatter.status !== "abandoned") {
          await writeSpec({ ...doc, frontmatter: { ...doc.frontmatter, status: "abandoned" } });
        }
      }

      ctx.addMessage("system", `${ICONS.warning} Abandoned. Phase: abandoned. Artefacts kept on disk.`);
    },
  };
}
