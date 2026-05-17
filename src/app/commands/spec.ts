/**
 * /spec slash command — write a spec file at ./specs/<slug>.md.
 *
 * The in-TUI editor flow that lived here previously has been removed:
 * spec files are now reviewed in the user's external editor of choice
 * (VS Code, vim, Notepad, …). After /spec creates the template the
 * user opens the file out-of-band, edits, saves, then returns here to
 * /approve, /revise, or /abandon.
 *
 * Behaviour:
 *   - `/spec` with no args:
 *     - if a spec is already linked to this session, print its path.
 *     - otherwise emit a hint about supplying a slug.
 *   - `/spec <slug>`:
 *     - if `<specsDirectory>/<slug>.md` exists, register it as the
 *       active spec and print its path.
 *     - otherwise write the template skeleton, register it, and print
 *       its path.
 */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { writeFileAtomic } from "../../utils/atomic-write.js";
import { SPEC_SLUG_PATTERN } from "../../spec/types.js";
import { loadSpecFromFile, SpecLoadError } from "../../spec/loader.js";
import { generateSpecTemplate } from "../../spec/template.js";
import { ICONS } from "../../tui/constants/icons.js";
import type { SlashCommand } from "../../tui/slash/registry.js";
import type { TUI } from "../../tui/core/tui.js";
import type { AppContext } from "../init-session-router.js";
import type { scanForInterview } from "../../spec/codebase-scan.js";
import type {
  generateInterviewQuestions,
  generatePlanFromAnswers,
  generateSpecFromAnswers,
} from "../../spec/interview.js";
import type { generateSlug } from "../../spec/slug-gen.js";

/**
 * Test-seam bundle so the prompt-handler's auto-spec flow can be
 * driven by canned LLM responses in tests. Each field is optional and
 * defaults to the real implementation. Production code leaves the
 * whole `interviewServices` field unset.
 */
export interface InterviewServices {
  scanCodebase?: typeof scanForInterview;
  generateQuestions?: typeof generateInterviewQuestions;
  generateSpec?: typeof generateSpecFromAnswers;
  generatePlan?: typeof generatePlanFromAnswers;
  generateSlug?: typeof generateSlug;
}

export interface SpecPlanCommandDeps {
  appCtx: AppContext;
  tui: TUI;
  /** Resolve the configured specs directory each call (so config updates take effect). */
  getSpecsDir: () => string;
  /** Resolve the configured plans directory each call. */
  getPlansDir: () => string;
  /** Project root for the codebase scan; defaults to process.cwd(). */
  getProjectRoot?: () => string;
  /**
   * When true, the prompt-handler skips the spec/plan gate entirely
   * (--no-spec, trivial-mode overrides). Unused by the slash commands
   * themselves — they always honour their own flow — but present here
   * because the same deps object is shared with prompt-handler.
   */
  bypass?: boolean;
  /** Test-seam bundle (codebase scan + LLM calls). Optional. */
  interviewServices?: InterviewServices;
}

export function createSpecCommand(deps: SpecPlanCommandDeps): SlashCommand {
  return {
    name: "spec",
    description: "Create a feature spec at ./specs/<slug>.md (review in your editor, then /approve)",
    args: "[slug]",
    async execute(args, ctx) {
      const slug = args.trim();

      // No slug + a spec is already open → reprint its path.
      if (!slug && deps.appCtx.lastOpenedSpec) {
        await registerSpec(deps, ctx, deps.appCtx.lastOpenedSpec.path);
        return;
      }
      if (!slug) {
        ctx.addMessage("system", "Usage: /spec <slug>  (kebab-case, e.g. user-auth)");
        return;
      }
      if (!SPEC_SLUG_PATTERN.test(slug)) {
        ctx.addMessage("error", `Invalid slug '${slug}'. Use kebab-case: lowercase letters, digits, hyphens.`);
        return;
      }

      const dir = resolve(deps.getSpecsDir());
      await mkdir(dir, { recursive: true });
      const path = resolve(dir, `${slug}.md`);

      if (!existsSync(path)) {
        const template = generateSpecTemplate(slug);
        await writeFileAtomic(path, template);
        ctx.addMessage("system", `${ICONS.success} Drafted ${path}`);
      }

      await registerSpec(deps, ctx, path, slug);
    },
  };
}

async function registerSpec(
  deps: SpecPlanCommandDeps,
  ctx: { addMessage: (role: string, content: string) => void },
  path: string,
  slugHint?: string,
): Promise<void> {
  try {
    const doc = await loadSpecFromFile(path);
    deps.appCtx.lastOpenedSpec = { slug: doc.frontmatter.slug, path };
    deps.appCtx.lastOpenedKind = "spec";
    ctx.addMessage(
      "system",
      `${ICONS.success} Spec '${doc.frontmatter.slug}' (status: ${doc.frontmatter.status}) — ${path}\n` +
        `Open in your editor (code, vim, notepad, ...) to review, then /approve, /revise, or /abandon here.`,
    );
  } catch (err) {
    if (err instanceof SpecLoadError) {
      ctx.addMessage("error", `Spec validation failed:\n  ${err.message}`);
    } else {
      ctx.addMessage("error", `Failed to load spec: ${err instanceof Error ? err.message : String(err)}`);
    }
    // Still register the file as the active spec by path so the user
    // can re-edit; the slug from the hint (or filename) keeps /approve usable.
    if (slugHint) {
      deps.appCtx.lastOpenedSpec = { slug: slugHint, path };
      deps.appCtx.lastOpenedKind = "spec";
    }
  }
}
