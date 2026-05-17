/**
 * /specs slash command — list every spec in the configured specs dir.
 */

import { listSpecs } from "../../spec/loader.js";
import { ICONS } from "../../tui/constants/icons.js";
import type { SlashCommand } from "../../tui/slash/registry.js";

import type { SpecPlanCommandDeps } from "./spec.js";

export function createSpecsCommand(deps: SpecPlanCommandDeps): SlashCommand {
  return {
    name: "specs",
    description: "List every spec at ./specs/*.md",
    async execute(_args, ctx) {
      const dir = deps.getSpecsDir();
      const specs = await listSpecs(dir);
      if (specs.length === 0) {
        ctx.addMessage("system", `No specs found in ${dir}. Create one with /spec <slug>.`);
        return;
      }
      const lines = [`${ICONS.bolt} Specs (${dir})`, ""];
      for (const s of specs) {
        lines.push(
          `  ${s.frontmatter.slug.padEnd(24)}  ${s.frontmatter.status.padEnd(10)}  ${s.frontmatter.last_updated}`,
        );
      }
      ctx.addMessage("system", lines.join("\n"));
    },
  };
}
