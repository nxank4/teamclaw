/**
 * Renderer for the `op:themes` chat-stream block.
 *
 * Each preview row uses its own theme's colors via `withPalette`, so
 * the user can see what each theme actually looks like without having
 * to switch into it. Mirrors the `op:compact` aesthetic (top/mid/bot
 * box-drawing) so the visual idiom is consistent.
 */
import { withPalette, tokens } from "../themes/tokens.js";
import type { Palette } from "../themes/semantic-tokens.js";
import { currentTier } from "../themes/resolver.js";

export const THEMES_MESSAGE_TAG = "op:themes";

/** Build the styled `op:themes` lines. */
export function renderThemesPreview(
  palettes: readonly Palette[],
  currentId: string,
  descriptions: Record<string, string>,
): string[] {
  const lines: string[] = [];

  const tl = tokens.ui.brandPrimary("┌");
  const mid = tokens.ui.brandPrimary("├");
  const vert = tokens.ui.brandPrimary("│");
  const bl = tokens.ui.brandPrimary("└");

  lines.push(`${tl} ${tokens.ui.textTertiary(THEMES_MESSAGE_TAG)}`);
  lines.push(`${mid} ${tokens.ui.textSecondary("Available themes:")}`);
  lines.push(vert);

  for (const palette of palettes) {
    withPalette(palette, (t) => {
      const marker = palette.id === currentId
        ? t.ui.brandPrimary(`▸ ${palette.id}`) + t.ui.textTertiary("  (current)")
        : "  " + t.ui.textPrimary(palette.id);
      lines.push(`${vert} ${marker}`);

      // Sample line shows hierarchy: body text, brand-color word,
      // accent-color inline code, tertiary punctuation.
      const sample = [
        t.ui.textPrimary("The quick brown fox"),
        t.ui.textTertiary("·"),
        t.md.h1("keywords"),
        t.ui.textTertiary("·"),
        t.md.inlineCode('"strings"'),
        t.ui.textTertiary("·"),
        t.md.h2("42"),
      ].join(" ");
      lines.push(`${vert}   ${sample}`);

      const desc = descriptions[palette.id] ?? "";
      if (desc) {
        lines.push(`${vert}   ${t.ui.textTertiary(desc)}`);
      }
      lines.push(vert);
    });
  }

  const hint = tokens.ui.textTertiary(`/theme <name> to switch · tier: ${currentTier()}`);
  lines.push(`${bl} ${hint}`);

  return lines;
}
