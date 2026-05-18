/**
 * Catppuccin Mocha — legacy theme, available but no longer default.
 *
 * Hex values match github.com/catppuccin (MIT license); same look as
 * pre-token-system OpenPawl. Re-expressed in the new SemanticPalette
 * shape so it sits alongside pawlwinkle and pawlbon without special-casing.
 *
 * Variant: dark.
 */
import type { Palette } from "../semantic-tokens.js";

export const catppuccinMocha: Palette = {
  id: "catppuccin-mocha",
  name: "Catppuccin Mocha",
  variant: "dark",
  semantic: {
    bg: {
      base:     "#1E1E2E",
      elevated: "#313244",
      sticky:   "#181825",
      selected: "#45475A",
      code:     "#313244",
    },
    text: {
      primary:   "#CDD6F4",
      secondary: "#BAC2DE",
      tertiary:  "#7F849C",
      disabled:  "#6C7086",
      inverse:   "#1E1E2E",
    },
    brand: {
      primary: "#89B4FA",
      accent:  "#94E2D5",
    },
    status: {
      success: "#A6E3A1",
      warning: "#F9E2AF",
      error:   "#F38BA8",
      info:    "#74C7EC",
    },
    border: {
      default: "#45475A",
      active:  "#CBA6F7",
      divider: "#45475A",
      subtle:  "#313244",
    },
    syntax: {
      keyword:  "#CBA6F7",
      string:   "#A6E3A1",
      number:   "#FAB387",
      comment:  "#6C7086",
      function: "#89B4FA",
      type:     "#F9E2AF",
      operator: "#89DCEB",
      constant: "#FAB387",
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

    "brand.primary": "blue",
    "brand.accent":  "cyan",

    "status.success": "green",
    "status.warning": "yellow",
    "status.error":   "red",
    "status.info":    "cyan",

    "border.default": "gray",
    "border.active":  "magenta",
    "border.divider": "gray",
    "border.subtle":  "gray",

    "syntax.keyword":  "magenta",
    "syntax.string":   "green",
    "syntax.number":   "yellow",
    "syntax.comment":  "gray",
    "syntax.function": "blue",
    "syntax.type":     "yellow",
    "syntax.operator": "cyan",
    "syntax.constant": "yellow",
  },
};
