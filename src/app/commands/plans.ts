/**
 * /plans slash command — list every plan in the configured plans dir.
 */

import { listPlans } from "../../plans/loader.js";
import { ICONS } from "../../tui/constants/icons.js";
import type { SlashCommand } from "../../tui/slash/registry.js";

import type { SpecPlanCommandDeps } from "./spec.js";

export function createPlansCommand(deps: SpecPlanCommandDeps): SlashCommand {
  return {
    name: "plans",
    description: "List every plan at ./plans/*.md",
    async execute(_args, ctx) {
      const dir = deps.getPlansDir();
      const plans = await listPlans(dir);
      if (plans.length === 0) {
        ctx.addMessage("system", `No plans found in ${dir}. Create one with /plan after opening a spec.`);
        return;
      }
      const lines = [`${ICONS.bolt} Plans (${dir})`, ""];
      for (const p of plans) {
        const spec = p.frontmatter.spec ?? "—";
        lines.push(
          `  ${p.frontmatter.slug.padEnd(24)}  ${p.frontmatter.status.padEnd(10)}  spec:${spec}`,
        );
      }
      ctx.addMessage("system", lines.join("\n"));
    },
  };
}
