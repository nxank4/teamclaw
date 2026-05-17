/**
 * /revise slash command — re-draft the active spec or plan from the
 * original interview answers plus user feedback.
 *
 * Two forms:
 *   /revise <text>   inline-arg: use <text> as feedback, re-draft now.
 *   /revise          no-arg: emit "What should change?", capture the
 *                    next user turn as feedback (pendingReviseFeedback
 *                    on AppContext).
 *
 * Works in two phase contexts:
 *   - spec_drafting with pendingPhaseConfirmation { kind: "spec" }
 *     → overwrite ./specs/<slug>.md
 *   - plan_drafting with pendingPhaseConfirmation { kind: "plan" }
 *     → overwrite ./plans/<slug>.md
 *   - executing
 *     → not supported by the interview flow; emit a guidance error.
 *
 * /revise inherits its actual re-draft mechanics from
 * {@link reviseFromFeedback} so both inline-arg and follow-up paths
 * end up in the same code.
 */

import { reviseFromFeedback } from "../auto-spec.js";
import { ICONS } from "../../tui/constants/icons.js";
import type { SlashCommand } from "../../tui/slash/registry.js";

import type { SpecPlanCommandDeps } from "./spec.js";

export function createReviseCommand(deps: SpecPlanCommandDeps): SlashCommand {
  return {
    name: "revise",
    description: "Re-draft the active spec or plan from new feedback",
    args: "[feedback]",
    async execute(args, ctx) {
      const session = deps.appCtx.chatSession;
      if (!session) {
        ctx.addMessage("error", "No active session.");
        return;
      }
      const pending = deps.appCtx.pendingPhaseConfirmation;
      if (!pending) {
        ctx.addMessage(
          "error",
          "/revise needs a recently drafted spec or plan. None is pending.",
        );
        return;
      }

      const feedback = args.trim();
      if (feedback === "") {
        // No-arg form — wait for the next user turn to supply feedback.
        deps.appCtx.pendingReviseFeedback = { kind: pending.kind };
        ctx.addMessage(
          "system",
          `${ICONS.bolt} What should change about the ${pending.kind}? (next message is your feedback; empty input cancels)`,
        );
        return;
      }

      // Best-effort abort of any in-flight router dispatch (matches the
      // previous /revise semantics where executing-phase reverts to plan).
      try {
        deps.appCtx.router?.abort(session.id);
      } catch {
        // best-effort
      }

      const msgCtx = {
        addMessage: (role: string, content: string) => ctx.addMessage(role, content),
      };
      await reviseFromFeedback(feedback, session, msgCtx, deps);
    },
  };
}
