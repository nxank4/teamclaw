/**
 * Layer 2 — Semantic palette contract.
 *
 * Every theme must satisfy this exact 28-key shape. Component code never
 * references hex values or semantic paths directly; it goes through the
 * component-token alias map (see component-tokens.ts) and the runtime
 * resolver (see resolver.ts).
 *
 * If you find yourself wanting a new key here, you almost certainly want
 * a new component-token alias instead. New semantic keys require all
 * palettes to be updated.
 */

/** Canonical ANSI-16 color name. Used by per-palette ansi16 fallback maps. */
export type AnsiColorName =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "gray"
  | "brightRed"
  | "brightGreen"
  | "brightYellow"
  | "brightBlue"
  | "brightMagenta"
  | "brightCyan"
  | "brightWhite";

/** The full semantic-token shape every palette must provide. */
export interface SemanticPalette {
  /** Backgrounds — surface hierarchy from canvas to selected emphasis. */
  bg: {
    /** App background. Lowest elevation. */
    base: string;
    /** Cards, panels, status bar. */
    elevated: string;
    /** Sticky regions (top header / agent status). */
    sticky: string;
    /** Selected row / focused item. */
    selected: string;
    /** Code-block background. */
    code: string;
  };

  /** Foreground text — readability hierarchy. */
  text: {
    /** Main content. */
    primary: string;
    /** Supporting info, secondary labels. */
    secondary: string;
    /** Least important — hints, captions. */
    tertiary: string;
    /** Disabled / inactive. */
    disabled: string;
    /** Text rendered on a bright/inverse background. */
    inverse: string;
  };

  /** Brand identity. Use sparingly for moments of emphasis. */
  brand: {
    primary: string;
    accent: string;
  };

  /** Status colors. Used by tool state, dots, confirm dialogs, diffs. */
  status: {
    success: string;
    warning: string;
    error: string;
    info: string;
  };

  /** Borders and rules. */
  border: {
    /** Default panel/box border. */
    default: string;
    /** Border around the focused or active element. */
    active: string;
    /** Internal divider inside a panel/block. */
    divider: string;
    /** Whisper-thin border, near-invisible at a glance. */
    subtle: string;
  };

  /** Syntax highlighting for code blocks. */
  syntax: {
    keyword: string;
    string: string;
    number: string;
    comment: string;
    function: string;
    type: string;
    operator: string;
    constant: string;
  };
}

/**
 * Dotted path into SemanticPalette. Compile-time enumerated so component
 * aliases (component-tokens.ts) can only point at real keys.
 */
export type SemanticPath =
  | `bg.${keyof SemanticPalette["bg"]}`
  | `text.${keyof SemanticPalette["text"]}`
  | `brand.${keyof SemanticPalette["brand"]}`
  | `status.${keyof SemanticPalette["status"]}`
  | `border.${keyof SemanticPalette["border"]}`
  | `syntax.${keyof SemanticPalette["syntax"]}`;

/**
 * A full theme — Layer 1 palette + ANSI-16 fallback table.
 *
 * Each theme file (palettes/pawlwinkle.ts, palettes/pawlbon.ts,
 * palettes/catppuccin-mocha.ts) exports one of these.
 */
export interface Palette {
  id: PaletteId;
  name: string;
  variant: "dark";
  /** Layer 1 — raw hex values for every semantic token. */
  semantic: SemanticPalette;
  /** ANSI-16 fallback map for terminals without 256/truecolor support. */
  ansi16: Record<SemanticPath, AnsiColorName>;
}

/** Canonical theme identifiers. New themes require updating this union. */
export type PaletteId = "pawlwinkle" | "pawlbon" | "catppuccin-mocha";

/** Thrown by the loader/resolver when a palette is missing a required key. */
export class ThemePaletteError extends Error {
  constructor(paletteId: string, missingPath: string) {
    super(`Palette "${paletteId}" is missing required token: ${missingPath}`);
    this.name = "ThemePaletteError";
  }
}

/**
 * Walk a dotted SemanticPath against a palette and return the hex value.
 * Throws ThemePaletteError if any segment is missing.
 */
export function getHex(palette: SemanticPalette, path: SemanticPath): string {
  const [group, key] = path.split(".") as [string, string];
  const bucket = (palette as unknown as Record<string, Record<string, string>>)[group];
  if (!bucket) throw new ThemePaletteError("unknown", path);
  const hex = bucket[key];
  if (!hex) throw new ThemePaletteError("unknown", path);
  return hex;
}

/** All semantic paths, in canonical order. Useful for validation + tests. */
export const ALL_SEMANTIC_PATHS: readonly SemanticPath[] = [
  "bg.base", "bg.elevated", "bg.sticky", "bg.selected", "bg.code",
  "text.primary", "text.secondary", "text.tertiary", "text.disabled", "text.inverse",
  "brand.primary", "brand.accent",
  "status.success", "status.warning", "status.error", "status.info",
  "border.default", "border.active", "border.divider", "border.subtle",
  "syntax.keyword", "syntax.string", "syntax.number", "syntax.comment",
  "syntax.function", "syntax.type", "syntax.operator", "syntax.constant",
] as const;
