/**
 * /revise slash command.
 *
 * From the `executing` phase, re-opens the linked plan in $EDITOR and
 * rewinds the phase to `plan_drafting` (preserves the approved spec).
 * After the user re-saves and re-approves, the dispatch can restart.
 *
 * Errors when not in executing — the user spec restricts /revise to
 * exactly that state.
 */

import { openInEditor } from "../../utils/open-in-editor.js";
import { transition } from "../../session/phase-machine.js";
import { ICONS } from "../../tui/constants/icons.js";
import type { SlashCommand } from "../../tui/slash/registry.js";

import type { SpecPlanCommandDeps } from "./spec.js";

export function createReviseCommand(deps: SpecPlanCommandDeps): SlashCommand {
  return {
    name: "revise",
    description: "From executing, return to plan_drafting and re-open the plan in $EDITOR",
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
      ctx.addMessage("system", `${ICONS.bolt} Returned to plan_drafting. Re-opening plan in editor.`);

      const editor = deps.openInEditorImpl ?? openInEditor;
      await editor({ path: planPath, tui: deps.tui });

      deps.appCtx.pendingPhaseConfirmation = {
        kind: "plan",
        specPath: phase.currentSpecPath ?? "",
        planPath,
        originalPrompt: "",
      };
      ctx.addMessage("system", `Approve plan? [y/n/edit]`);
    },
  };
}
