/**
 * Fallback rendering for terminals without 24-bit color.
 *
 * Two responsibilities:
 *   1. ANSI16_FN — table mapping AnsiColorName → StyleFn (the actual escape
 *      codes for the 16 named colors). Per-palette `ansi16` maps in each
 *      theme reference these names.
 *   2. NO_COLOR_ATTR — project-wide map from SemanticPath → StyleFn for
 *      "no color" mode, where the only available styling is bold / dim /
 *      inverse / identity.
 */
import {
  black, red, green, yellow, blue, magenta, cyan, white, gray,
  bold, dim, inverse,
} from "../core/ansi.js";
import type { AnsiColorName, SemanticPath } from "./semantic-tokens.js";
import type { StyleFn } from "./style-fn.js";

const identity: StyleFn = (s) => s;

const brightRed     = (s: string) => `\x1b[91m${s}\x1b[39m`;
const brightGreen   = (s: string) => `\x1b[92m${s}\x1b[39m`;
const brightYellow  = (s: string) => `\x1b[93m${s}\x1b[39m`;
const brightBlue    = (s: string) => `\x1b[94m${s}\x1b[39m`;
const brightMagenta = (s: string) => `\x1b[95m${s}\x1b[39m`;
const brightCyan    = (s: string) => `\x1b[96m${s}\x1b[39m`;
const brightWhite   = (s: string) => `\x1b[97m${s}\x1b[39m`;

/** AnsiColorName → StyleFn. Used by the 16-color tier of the resolver. */
export const ANSI16_FN: Record<AnsiColorName, StyleFn> = {
  black, red, green, yellow, blue, magenta, cyan, white, gray,
  brightRed, brightGreen, brightYellow,
  brightBlue, brightMagenta, brightCyan, brightWhite,
};

/**
 * No-color attribute map. When the terminal supports zero color, tokens
 * still need to convey hierarchy — fall back to bold/dim/inverse so
 * structure remains visible.
 *
 * Backgrounds collapse to identity (attributes can't paint backgrounds);
 * the inverse text token uses ANSI inverse so it still reads on a "bright"
 * mental background.
 */
export const NO_COLOR_ATTR: Record<SemanticPath, StyleFn> = {
  "bg.base":          identity,
  "bg.elevated":      identity,
  "bg.sticky":        identity,
  "bg.selected":      inverse,
  "bg.code":          identity,

  "text.primary":     identity,
  "text.secondary":   identity,
  "text.tertiary":    dim,
  "text.disabled":    dim,
  "text.inverse":     inverse,

  "brand.primary":    bold,
  "brand.accent":     bold,

  "status.success":   bold,
  "status.warning":   bold,
  "status.error":     bold,
  "status.info":      identity,

  "border.default":   identity,
  "border.active":    bold,
  "border.divider":   dim,
  "border.subtle":    dim,

  "syntax.keyword":   bold,
  "syntax.string":    identity,
  "syntax.number":    identity,
  "syntax.comment":   dim,
  "syntax.function":  bold,
  "syntax.type":      identity,
  "syntax.operator":  identity,
  "syntax.constant":  identity,
};
