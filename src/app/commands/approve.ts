/**
 * /approve slash command — phase-aware with legacy fallback.
 *
 * Phase-aware (new):
 *   - spec_drafting → approve spec → spec_approved → openPlan, auto-
 *     create + open a plan template, queue "Approve plan? [y/n/edit]"
 *   - plan_drafting → approve plan → plan_approved → startExecute
 *
 * Legacy fallback (preserves PR #177 behaviour for sessions that bypassed
 * the phase machine):
 *   - phase=idle but lastOpenedKind set → flip the on-disk frontmatter
 *     from draft → approved with no phase transition or plan auto-open
 *
 * Errors when the target is not in 'draft' state or when nothing is
 * available to approve.
 */

import {
  approvePlanAndExecute,
  approveSpecAndOpenPlan,
} from "../prompt-handler.js";
import { loadPlanFromFile } from "../../plans/loader.js";
import { writePlan } from "../../plans/writer.js";
import { loadSpecFromFile } from "../../spec/loader.js";
import { writeSpec } from "../../spec/writer.js";
import { ICONS } from "../../tui/constants/icons.js";
import type { SlashCommand } from "../../tui/slash/registry.js";

import type { SpecPlanCommandDeps } from "./spec.js";

export function createApproveCommand(deps: SpecPlanCommandDeps): SlashCommand {
  return {
    name: "approve",
    description: "Phase-aware approval: spec→plan_drafting, plan→executing",
    async execute(_args, ctx) {
      const session = deps.appCtx.chatSession;
      const router = deps.appCtx.router;
      const phase = session?.getPhase().currentPhase ?? "idle";

      // Phase-aware path — requires session + router.
      if ((phase === "spec_drafting" || phase === "plan_drafting") && session && router) {
        const layoutAdapter = {
          tui: deps.tui,
          statusBar: { updateSegment: () => {} },
          messages: { addMessage: () => {} },
        } as unknown as import("../layout.js").AppLayout;
        const helperCtx = {
          addMessage: (role: string, content: string) => ctx.addMessage(role, content),
        };
        if (phase === "spec_drafting") {
          const specPath = session.getPhase().currentSpecPath;
          if (!specPath) {
            ctx.addMessage("error", "Session is in spec_drafting but no spec is linked. Run /spec to open one.");
            return;
          }
          await approveSpecAndOpenPlan({
            specPath,
            originalPrompt: null,
            deps,
            session,
            layout: layoutAdapter,
            ctx: helperCtx,
          });
          return;
        }
        const planPath = session.getPhase().currentPlanPath;
        if (!planPath) {
          ctx.addMessage("error", "Session is in plan_drafting but no plan is linked. Run /plan to open one.");
          return;
        }
        await approvePlanAndExecute({
          planPath,
          originalPrompt: "",
          deps,
          session,
          layout: layoutAdapter,
          ctx: helperCtx,
          router,
        });
        return;
      }

      // Legacy fallback — flip frontmatter only, no phase transition.
      const kind = deps.appCtx.lastOpenedKind;
      if (!kind) {
        ctx.addMessage(
          "error",
          "Nothing to approve. Open a spec with /spec <slug> or a plan with /plan first.",
        );
        return;
      }
      if (kind === "spec") {
        const target = deps.appCtx.lastOpenedSpec;
        if (!target) {
          ctx.addMessage("error", "Spec reference is missing — re-open the spec with /spec.");
          return;
        }
        const doc = await loadSpecFromFile(target.path);
        if (doc.frontmatter.status !== "draft") {
          ctx.addMessage(
            "error",
            `Spec '${doc.frontmatter.slug}' is in status '${doc.frontmatter.status}', not 'draft'. /approve only flips draft → approved.`,
          );
          return;
        }
        await writeSpec({
          ...doc,
          frontmatter: { ...doc.frontmatter, status: "approved" },
        });
        ctx.addMessage("system", `${ICONS.success} Spec '${doc.frontmatter.slug}' approved.`);
        return;
      }

      const target = deps.appCtx.lastOpenedPlan;
      if (!target) {
        ctx.addMessage("error", "Plan reference is missing — re-open the plan with /plan.");
        return;
      }
      const doc = await loadPlanFromFile(target.path);
      if (doc.frontmatter.status !== "draft") {
        ctx.addMessage(
          "error",
          `Plan '${doc.frontmatter.slug}' is in status '${doc.frontmatter.status}', not 'draft'. /approve only flips draft → approved.`,
        );
        return;
      }
      await writePlan({
        ...doc,
        frontmatter: { ...doc.frontmatter, status: "approved" },
      });
      ctx.addMessage("system", `${ICONS.success} Plan '${doc.frontmatter.slug}' approved.`);
    },
  };
}
