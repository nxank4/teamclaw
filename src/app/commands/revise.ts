/**
 * /revise slash command.
 *
 * From the `executing` phase, rewinds the phase machine back to
 * `plan_drafting` (preserving the approved spec) and asks the user to
 * edit the plan file externally. After they save, /approve flips it
 * back to approved and dispatch can restart.
 *
 * The previous in-TUI $EDITOR spawn has been removed — the file is
 * reviewed in whatever editor the user prefers.
 *
 * Errors when not in executing — the user spec restricts /revise to
 * exactly that state.
 */

import { transition } from "../../session/phase-machine.js";
import { ICONS } from "../../tui/constants/icons.js";
import type { SlashCommand } from "../../tui/slash/registry.js";

import type { SpecPlanCommandDeps } from "./spec.js";

export function createReviseCommand(deps: SpecPlanCommandDeps): SlashCommand {
  return {
    name: "revise",
    description: "From executing, return to plan_drafting so you can edit the plan and re-approve",
    async execute(_args, ctx) {
      const session = deps.appCtx.chatSession;
      if (!session) {
        ctx.addMessage("error", "No active session.");
        return;
      }
      const phase = session.getPhase();
      if (phase.currentPhase !== "executing") {
        ctx.addMessage(
          "error",
          `/revise only runs from 'executing'; current phase is '${phase.currentPhase}'.`,
        );
        return;
      }
      const planPath = phase.currentPlanPath;
      if (!planPath) {
        ctx.addMessage("error", "Session is executing but no plan path is linked.");
        return;
      }

      // Best-effort abort of any in-flight router dispatch. The
      // dispatcher hooks AbortSignal off the controller stored on the
      // PromptRouter; calling abort() resolves the in-flight dispatch
      // with an "aborted" error which the prompt-handler renders.
      try {
        deps.appCtx.router?.abort(session.id);
      } catch {
        // best-effort
      }

      session.setPhase(transition("executing", "revise"), "revise");

      deps.appCtx.pendingPhaseConfirmation = {
        kind: "plan",
        specPath: phase.currentSpecPath ?? "",
        planPath,
        originalPrompt: "",
      };
      ctx.addMessage(
        "system",
        `${ICONS.bolt} Returned to plan_drafting. Edit ${planPath} in your editor, then reply with y to approve, n to abandon.`,
      );
    },
  };
}
