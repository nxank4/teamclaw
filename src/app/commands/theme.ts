/**
 * /theme and /themes commands.
 *
 * /theme <name>     — switch to a named theme; persists to global config
 * /theme            — shorthand for /themes
 * /themes           — open the interactive picker (arrow-driven), or
 *                     fall back to a static block when the layout-aware
 *                     mountInteractiveBlock helper isn't available
 *                     (headless contexts, certain tests).
 *
 * Unknown name on /theme <name> → warning + valid-name list; active
 * theme unchanged.
 */
import type { SlashCommand, CommandContext } from "../../tui/index.js";
import { getThemeEngine } from "../../tui/themes/theme-engine.js";
import { ICONS } from "../../tui/constants/icons.js";
import {
  renderThemesPreview,
  renderInteractiveThemesPreview,
  THEMES_MESSAGE_TAG,
} from "../../tui/components/themes-preview.js";
import { PALETTE_DESCRIPTIONS } from "../../tui/themes/palettes/index.js";
import { tokens } from "../../tui/themes/tokens.js";
import type { Palette } from "../../tui/themes/semantic-tokens.js";

async function persistTheme(themeId: string): Promise<void> {
  const { readGlobalConfigWithDefaults, writeGlobalConfig } = await import("../../core/global-config.js");
  const config = readGlobalConfigWithDefaults();
  config.uiTheme = themeId;
  writeGlobalConfig(config);
}

function emitStaticBlock(ctx: CommandContext): void {
  const engine = getThemeEngine();
  const palettes = engine.listPalettes();
  const currentId = engine.getCurrentId();
  const lines = renderThemesPreview(palettes, currentId, PALETTE_DESCRIPTIONS);
  ctx.addMessage("system", lines.join("\n"), { tag: THEMES_MESSAGE_TAG });
}

function openInteractiveBlock(ctx: CommandContext): void {
  const engine = getThemeEngine();
  const palettes = engine.listPalettes();
  const currentId = engine.getCurrentId();
  const initialIndex = Math.max(0, palettes.findIndex((p) => p.id === currentId));

  ctx.mountInteractiveBlock?.<Palette>({
    items: palettes,
    initialIndex,
    tag: THEMES_MESSAGE_TAG,
    statusHint: "themes picker · ↑↓ Enter Esc",
    render: (i) => renderInteractiveThemesPreview(palettes, i, currentId, PALETTE_DESCRIPTIONS),
    onSelect: async (palette) => {
      engine.switchTheme(palette.id);
      await persistTheme(palette.id);
      ctx.tui?.requestRender();
    },
    summary: (palette) =>
      tokens.picker.hint(`[${THEMES_MESSAGE_TAG}] switched to `) +
      tokens.ui.brandPrimary(palette.id),
  });
}

function openThemesBlock(ctx: CommandContext): void {
  if (ctx.mountInteractiveBlock) {
    openInteractiveBlock(ctx);
  } else {
    emitStaticBlock(ctx);
  }
}

export function createThemeCommand(): SlashCommand {
  return {
    name: "theme",
    aliases: ["t"],
    description: "Switch the active theme",
    args: "[theme-name]",
    async execute(args, ctx) {
      const engine = getThemeEngine();
      const trimmed = args.trim();

      if (!trimmed) {
        openThemesBlock(ctx);
        return;
      }

      const ok = engine.switchTheme(trimmed);
      if (ok) {
        await persistTheme(trimmed);
        ctx.addMessage("system", `${ICONS.success} Switched to ${trimmed}`);
        ctx.tui?.requestRender();
      } else {
        const available = engine.listPalettes().map((p) => p.id).join(", ");
        ctx.addMessage("error", `Unknown theme: ${trimmed}\nAvailable: ${available}`);
      }
    },
  };
}

export function createThemesCommand(): SlashCommand {
  return {
    name: "themes",
    description: "Open the interactive theme picker",
    async execute(_args, ctx) {
      openThemesBlock(ctx);
    },
  };
}
