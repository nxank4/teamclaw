/**
 * Renderers for the `op:themes` chat-stream block.
 *
 * Two flavors share the same box-drawing scaffolding:
 *   • renderThemesPreview        — static, marks `currentId` as "current".
 *   • renderInteractiveThemesPreview — keyboard-driven; the highlighted
 *     row gets a `▸` prefix in the picker's accent color, all rows align
 *     to the same column.
 *
 * Each preview row uses its own theme's colors via `withPalette`, so
 * users see what each theme actually looks like without switching to it.
 */
import { withPalette, tokens } from "../themes/tokens.js";
import type { Palette } from "../themes/semantic-tokens.js";
import { currentTier } from "../themes/resolver.js";

export const THEMES_MESSAGE_TAG = "op:themes";

const HEADER_LABEL = "Available themes:";

const STATIC_FOOTER = (): string =>
  tokens.picker.hint(`/theme <name> to switch · tier: ${currentTier()}`);

const INTERACTIVE_FOOTER = (): string =>
  tokens.picker.hint(`↑↓ navigate · Enter switch · Esc dismiss · /theme <name>`);

/**
 * Render one theme's two-line sample (color preview row + tagline).
 * Shared between static and interactive renderers. The caller supplies
 * the row prefix (e.g. `▸ ` for highlighted) and label color, which
 * carries the picker's intent (selected / unselected / current).
 */
function renderThemeRows(
  palette: Palette,
  vert: string,
  labelPrefix: string,
  labelFor: (p: Palette, t: typeof tokens) => string,
  descriptions: Record<string, string>,
): string[] {
  const rows: string[] = [];
  withPalette(palette, (t) => {
    rows.push(`${vert} ${labelPrefix}${labelFor(palette, t)}`);

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
    rows.push(`${vert}   ${sample}`);

    const desc = descriptions[palette.id] ?? "";
    if (desc) {
      rows.push(`${vert}   ${t.ui.textTertiary(desc)}`);
    }
    rows.push(vert);
  });
  return rows;
}

function header(): { tl: string; mid: string; vert: string; bl: string } {
  return {
    tl: tokens.ui.brandPrimary("┌"),
    mid: tokens.ui.brandPrimary("├"),
    vert: tokens.ui.brandPrimary("│"),
    bl: tokens.ui.brandPrimary("└"),
  };
}

/** Static `/themes` preview — no keyboard interaction. */
export function renderThemesPreview(
  palettes: readonly Palette[],
  currentId: string,
  descriptions: Record<string, string>,
): string[] {
  const { tl, mid, vert, bl } = header();
  const lines: string[] = [];

  lines.push(`${tl} ${tokens.ui.textTertiary(THEMES_MESSAGE_TAG)}`);
  lines.push(`${mid} ${tokens.ui.textSecondary(HEADER_LABEL)}`);
  lines.push(vert);

  for (const palette of palettes) {
    const labelFor = (p: Palette, t: typeof tokens): string =>
      p.id === currentId
        ? t.ui.brandPrimary(p.id) + t.ui.textTertiary("  (current)")
        : t.ui.textPrimary(p.id);
    // Static uses 3-space alignment so the column matches the
    // interactive renderer's ` ▸ ` prefix width.
    lines.push(...renderThemeRows(palette, vert, "  ", labelFor, descriptions));
  }

  lines.push(`${bl} ${STATIC_FOOTER()}`);
  return lines;
}

/**
 * Interactive `/themes` block — keyboard-driven. Identical layout to
 * the static version, but the highlighted row carries a `▸` marker and
 * the footer surfaces the key hints. The previously-active theme is
 * still annotated `(current)` so the user can tell at a glance whether
 * a navigation step would actually change anything.
 */
export function renderInteractiveThemesPreview(
  palettes: readonly Palette[],
  highlightedIndex: number,
  currentId: string,
  descriptions: Record<string, string>,
): string[] {
  const { tl, mid, vert, bl } = header();
  const lines: string[] = [];

  lines.push(`${tl} ${tokens.ui.textTertiary(THEMES_MESSAGE_TAG)}`);
  lines.push(`${mid} ${tokens.ui.textSecondary(HEADER_LABEL)}`);
  lines.push(vert);

  for (let i = 0; i < palettes.length; i++) {
    const palette = palettes[i]!;
    const highlighted = i === highlightedIndex;
    const labelPrefix = highlighted
      ? tokens.picker.itemSelected("▸ ")
      : "  ";
    const labelFor = (p: Palette, t: typeof tokens): string => {
      const isCurrent = p.id === currentId;
      const label = highlighted
        ? t.ui.brandPrimary(p.id)
        : t.ui.textPrimary(p.id);
      return isCurrent
        ? label + t.ui.textTertiary("  (current)")
        : label;
    };
    lines.push(...renderThemeRows(palette, vert, labelPrefix, labelFor, descriptions));
  }

  lines.push(`${bl} ${INTERACTIVE_FOOTER()}`);
  return lines;
}
