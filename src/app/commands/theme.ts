/**
 * /theme and /themes commands.
 *
 * /theme <name>     — switch to a named theme; persists to global config
 * /theme            — shorthand for /themes
 * /themes           — print the op:themes branded block with live previews
 *
 * Unknown name → warning + valid-name list; active theme unchanged.
 */
import type { SlashCommand } from "../../tui/index.js";
import { getThemeEngine } from "../../tui/themes/theme-engine.js";
import { ICONS } from "../../tui/constants/icons.js";
import {
  renderThemesPreview,
  THEMES_MESSAGE_TAG,
} from "../../tui/components/themes-preview.js";
import { PALETTE_DESCRIPTIONS } from "../../tui/themes/palettes/index.js";

async function persistTheme(themeId: string): Promise<void> {
  const { readGlobalConfigWithDefaults, writeGlobalConfig } = await import("../../core/global-config.js");
  const config = readGlobalConfigWithDefaults();
  config.uiTheme = themeId;
  writeGlobalConfig(config);
}

function emitThemesBlock(ctx: { addMessage: (role: string, content: string, options?: { tag?: string }) => void }): void {
  const engine = getThemeEngine();
  const palettes = engine.listPalettes();
  const currentId = engine.getCurrentId();
  const lines = renderThemesPreview(palettes, currentId, PALETTE_DESCRIPTIONS);
  ctx.addMessage("system", lines.join("\n"), { tag: THEMES_MESSAGE_TAG });
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
        // No args: show the same block as /themes.
        emitThemesBlock(ctx);
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
    description: "List available themes with live color previews",
    async execute(_args, ctx) {
      emitThemesBlock(ctx);
    },
  };
}
