/**
 * Pawlwinkle — the default OpenPawl theme.
 *
 * Soft periwinkle palette designed for calm, long sessions. Brand color
 * is a muted periwinkle (#898AC4) — distinctive without being loud, so
 * agent activity feels assistive rather than interruptive.
 *
 * Variant: dark.
 */
import type { Palette } from "../semantic-tokens.js";

export const pawlwinkle: Palette = {
  id: "pawlwinkle",
  name: "Pawlwinkle",
  variant: "dark",
  semantic: {
    bg: {
      base:     "#13131F",
      elevated: "#1E1E2E",
      sticky:   "#1A1A28",
      selected: "#2D2E47",
      code:     "#1A1B2A",
    },
    text: {
      primary:   "#C0C9EE",
      secondary: "#A2AADB",
      tertiary:  "#6A6B7F",
      disabled:  "#4A4B5C",
      inverse:   "#13131F",
    },
    brand: {
      primary: "#898AC4",
      accent:  "#B8A4F0",
    },
    status: {
      success: "#8DB596",
      warning: "#D4B483",
      error:   "#D08A8A",
      info:    "#898AC4",
    },
    border: {
      default: "#2D2E47",
      active:  "#898AC4",
      divider: "#2D2E47",
      subtle:  "#1E1E2E",
    },
    syntax: {
      keyword:  "#898AC4",
      string:   "#A0C4A0",
      number:   "#D4B483",
      comment:  "#6A6B7F",
      function: "#B8A4F0",
      type:     "#A2AADB",
      operator: "#C0C9EE",
      constant: "#D4B483",
    },
  },
  ansi16: {
    "bg.base":     "black",
    "bg.elevated": "black",
    "bg.sticky":   "black",
    "bg.selected": "gray",
    "bg.code":     "black",

    "text.primary":   "white",
    "text.secondary": "white",
    "text.tertiary":  "gray",
    "text.disabled":  "gray",
    "text.inverse":   "black",

    "brand.primary": "magenta",
    "brand.accent":  "brightMagenta",

    "status.success": "green",
    "status.warning": "yellow",
    "status.error":   "red",
    "status.info":    "blue",

    "border.default": "gray",
    "border.active":  "magenta",
    "border.divider": "gray",
    "border.subtle":  "gray",

    "syntax.keyword":  "magenta",
    "syntax.string":   "green",
    "syntax.number":   "yellow",
    "syntax.comment":  "gray",
    "syntax.function": "brightMagenta",
    "syntax.type":     "cyan",
    "syntax.operator": "white",
    "syntax.constant": "yellow",
  },
};
