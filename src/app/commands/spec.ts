/**
 * /spec slash command — create or open a spec file in $EDITOR.
 *
 * Behaviour:
 *   - `/spec` with no args:
 *     - if a spec is already linked to this session, open it.
 *     - otherwise emit a hint about supplying a slug.
 *   - `/spec <slug>`:
 *     - if `<specsDirectory>/<slug>.md` exists, open it.
 *     - otherwise write the template skeleton and open it.
 *
 * After the editor exits the file is reloaded so frontmatter errors
 * surface to the user. The session's `lastOpenedSpec` / `lastOpenedKind`
 * are updated so `/approve` and the upcoming dispatcher can find the
 * active spec.
 */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { writeFileAtomic } from "../../utils/atomic-write.js";
import {
  openInEditor,
  type OpenInEditorArgs,
  type OpenInEditorResult,
} from "../../utils/open-in-editor.js";
import { SPEC_SLUG_PATTERN } from "../../spec/types.js";
import { loadSpecFromFile, SpecLoadError } from "../../spec/loader.js";
import { generateSpecTemplate } from "../../spec/template.js";
import { ICONS } from "../../tui/constants/icons.js";
import type { SlashCommand } from "../../tui/slash/registry.js";
import type { TUI } from "../../tui/core/tui.js";
import type { AppContext } from "../init-session-router.js";

export interface SpecPlanCommandDeps {
  appCtx: AppContext;
  tui: TUI;
  /** Resolve the configured specs directory each call (so config updates take effect). */
  getSpecsDir: () => string;
  /** Resolve the configured plans directory each call. */
  getPlansDir: () => string;
  /** Test seam — defaults to the real openInEditor. */
  openInEditorImpl?: (args: OpenInEditorArgs) => Promise<OpenInEditorResult>;
}

export function createSpecCommand(deps: SpecPlanCommandDeps): SlashCommand {
  return {
    name: "spec",
    description: "Create or open a feature spec at ./specs/<slug>.md",
    args: "[slug]",
    async execute(args, ctx) {
      const slug = args.trim();

      // No slug + a spec is already open → reopen the active one.
      if (!slug && deps.appCtx.lastOpenedSpec) {
        await openSpec(deps, ctx, deps.appCtx.lastOpenedSpec.path);
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
        ctx.addMessage("system", `${ICONS.success} Created ${path}`);
      }

      await openSpec(deps, ctx, path, slug);
    },
  };
}

async function openSpec(
  deps: SpecPlanCommandDeps,
  ctx: { addMessage: (role: string, content: string) => void },
  path: string,
  slugHint?: string,
): Promise<void> {
  const editorImpl = deps.openInEditorImpl ?? openInEditor;
  try {
    await editorImpl({ path, tui: deps.tui });
  } catch (err) {
    ctx.addMessage("error", `Editor failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  // Reload + validate so frontmatter errors surface immediately.
  try {
    const doc = await loadSpecFromFile(path);
    deps.appCtx.lastOpenedSpec = { slug: doc.frontmatter.slug, path };
    deps.appCtx.lastOpenedKind = "spec";
    ctx.addMessage("system", `${ICONS.success} Spec '${doc.frontmatter.slug}' (status: ${doc.frontmatter.status}) — ${path}`);
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
