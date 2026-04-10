/**
 * /hotkeys command — display current keyboard shortcuts.
 */
import type { SlashCommand } from "../../tui/index.js";
import { getInputShortcutsForDisplay } from "../../tui/keybindings/input-shortcuts.js";

const CATEGORY_NAMES: Record<string, string> = {
  editor: "Editor",
  messages: "Messages",
  app: "Application",
  nav: "Navigation",
  mode: "Modes",
};

export function createHotkeysCommand(): SlashCommand {
  return {
    name: "hotkeys",
    aliases: ["keys", "shortcuts", "keymap"],
    description: "Show keyboard shortcuts",
    async execute(_args, ctx) {
      if (!ctx.tui) {
        ctx.addMessage("error", "Keybindings only available in TUI mode.");
        return;
      }

      const bindings = ctx.tui.keybindings.getBindingsForDisplay();
      const groups = new Map<string, typeof bindings>();
      for (const b of bindings) {
        const cat = b.action.split(".")[0]!;
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat)!.push(b);
      }

      const lines: string[] = ["\u2328 Keyboard Shortcuts\n"];
      for (const [cat, items] of groups) {
        lines.push(`  **${CATEGORY_NAMES[cat] ?? cat}**`);
        for (const item of items) {
          const keys = item.keys.join(", ");
          lines.push(`    ${keys.padEnd(28)} ${item.description}`);
        }
        lines.push("");
      }

      // Text editing shortcuts (shared across all input fields)
      const inputShortcuts = getInputShortcutsForDisplay();
      lines.push("  **Text Editing** _(all input fields)_");
      for (const s of inputShortcuts) {
        lines.push(`    ${s.keys.padEnd(28)} ${s.description}`);
      }
      lines.push("");

      lines.push(`  Preset: ${ctx.tui.keybindings.presetName}`);
      lines.push("  Config: ~/.openpawl/keybindings.json");

      ctx.addMessage("system", lines.join("\n"));
    },
  };
}
