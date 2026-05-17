/**
 * /plan slash command — write an implementation plan at
 * ./plans/<slug>.md. Requires a linked spec via /spec first.
 *
 * The in-TUI editor flow has been removed: plan files are reviewed in
 * the user's external editor of choice. After /plan creates the
 * template the user opens the file out-of-band, edits, saves, then
 * returns here to /approve, /revise, or /abandon.
 */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { writeFileAtomic } from "../../utils/atomic-write.js";
import { PLAN_SLUG_PATTERN } from "../../plans/types.js";

import { loadPlanFromFile, PlanLoadError } from "../../plans/loader.js";
import { generatePlanTemplate } from "../../plans/template.js";
import { ICONS } from "../../tui/constants/icons.js";
import type { SlashCommand } from "../../tui/slash/registry.js";

import type { SpecPlanCommandDeps } from "./spec.js";

/**
 * Legacy shape preserved so existing call sites (src/app/index.ts and
 * src/app/commands/index.ts) keep compiling. The legacy
 * flashMessage-only deps are no longer used by this command; new
 * callers pass SpecPlanCommandDeps directly via createPlanCommand.
 */
export interface PlanCommandDeps {
  appCtx: SpecPlanCommandDeps["appCtx"];
  tui: SpecPlanCommandDeps["tui"];
  getSpecsDir: SpecPlanCommandDeps["getSpecsDir"];
  getPlansDir: SpecPlanCommandDeps["getPlansDir"];
  /** @deprecated unused; kept for source-compat with the old createPlanCommand signature. */
  flashMessage?: (msg: string) => void;
}

export function createPlanCommand(deps: PlanCommandDeps): SlashCommand {
  return {
    name: "plan",
    description: "Create an implementation plan at ./plans/<slug>.md (review in your editor, then /approve)",
    args: "[slug]",
    async execute(args, ctx) {
      const argSlug = args.trim();

      // No arg + we have an open plan → reprint its path.
      if (!argSlug && deps.appCtx.lastOpenedPlan) {
        await registerPlan(deps, ctx, deps.appCtx.lastOpenedPlan.path);
        return;
      }

      const linkedSpec = deps.appCtx.lastOpenedSpec;
      if (!linkedSpec) {
        ctx.addMessage(
          "error",
          "No spec is currently open. Run /spec <slug> first — plans are derived from specs.",
        );
        return;
      }

      // Default the plan slug to the linked spec's slug. Users can
      // override by supplying an explicit arg.
      const slug = argSlug || linkedSpec.slug;
      if (!PLAN_SLUG_PATTERN.test(slug)) {
        ctx.addMessage("error", `Invalid slug '${slug}'. Use kebab-case.`);
        return;
      }

      const dir = resolve(deps.getPlansDir());
      await mkdir(dir, { recursive: true });
      const path = resolve(dir, `${slug}.md`);

      if (!existsSync(path)) {
        const specRelative = relative(dir, linkedSpec.path);
        const template = generatePlanTemplate({ slug, specPath: specRelative });
        await writeFileAtomic(path, template);
        ctx.addMessage("system", `${ICONS.success} Drafted ${path}`);
      }

      await registerPlan(deps, ctx, path, slug);
    },
  };
}

async function registerPlan(
  deps: PlanCommandDeps,
  ctx: { addMessage: (role: string, content: string) => void },
  path: string,
  slugHint?: string,
): Promise<void> {
  try {
    const doc = await loadPlanFromFile(path);
    deps.appCtx.lastOpenedPlan = { slug: doc.frontmatter.slug, path };
    deps.appCtx.lastOpenedKind = "plan";
    const taskCount = doc.tasks.length;
    ctx.addMessage(
      "system",
      `${ICONS.success} Plan '${doc.frontmatter.slug}' (status: ${doc.frontmatter.status}, ${taskCount} task${taskCount === 1 ? "" : "s"}) — ${path}\n` +
        `Open in your editor to review, then /approve, /revise, or /abandon here.`,
    );
  } catch (err) {
    if (err instanceof PlanLoadError) {
      ctx.addMessage("error", `Plan validation failed:\n  ${err.message}`);
    } else {
      ctx.addMessage("error", `Failed to load plan: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (slugHint) {
      deps.appCtx.lastOpenedPlan = { slug: slugHint, path };
      deps.appCtx.lastOpenedKind = "plan";
    }
  }
}
