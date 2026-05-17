/**
 * /approve slash command — flip the most-recently-opened spec or plan
 * from "draft" to "approved".
 *
 * Discrimination uses `appCtx.lastOpenedKind` (set by /spec and /plan
 * on open). Errors when nothing has been opened or when the target is
 * not in the `draft` state.
 */

import { loadSpecFromFile } from "../../spec/loader.js";
import { writeSpec } from "../../spec/writer.js";
import { loadPlanFromFile } from "../../plans/loader.js";
import { writePlan } from "../../plans/writer.js";
import { ICONS } from "../../tui/constants/icons.js";
import type { SlashCommand } from "../../tui/slash/registry.js";

import type { SpecPlanCommandDeps } from "./spec.js";

export function createApproveCommand(deps: SpecPlanCommandDeps): SlashCommand {
  return {
    name: "approve",
    description: "Mark the most-recently-opened spec or plan as approved",
    async execute(_args, ctx) {
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
