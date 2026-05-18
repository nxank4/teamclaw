/**
 * Pawlbon — high-contrast variant.
 *
 * Sharper, more saturated palette for power users who want strong
 * visual hierarchy. Vivid status colors, harder darks, brighter brand
 * accents. Same shape as pawlwinkle so switching is just a config flip.
 *
 * Variant: dark.
 */
import type { Palette } from "../semantic-tokens.js";

export const pawlbon: Palette = {
  id: "pawlbon",
  name: "Pawlbon",
  variant: "dark",
  semantic: {
    bg: {
      base:     "#0D0E14",
      elevated: "#161823",
      sticky:   "#11121C",
      selected: "#2A2D3E",
      code:     "#0F1018",
    },
    text: {
      primary:   "#E4E7F2",
      secondary: "#9CA3B8",
      tertiary:  "#5C6275",
      disabled:  "#3A3F4F",
      inverse:   "#0D0E14",
    },
    brand: {
      primary: "#7C7FE8",
      accent:  "#B47CF0",
    },
    status: {
      success: "#4CC38A",
      warning: "#F0B86E",
      error:   "#E5484D",
      info:    "#7C7FE8",
    },
    border: {
      default: "#2A2D3E",
      active:  "#7C7FE8",
      divider: "#2A2D3E",
      subtle:  "#161823",
    },
    syntax: {
      keyword:  "#B47CF0",
      string:   "#4CC38A",
      number:   "#F0B86E",
      comment:  "#5C6275",
      function: "#7C7FE8",
      type:     "#9CA3B8",
      operator: "#E4E7F2",
      constant: "#F0B86E",
    },
  },
  ansi16: {
    "bg.base":     "black",
    "bg.elevated": "black",
    "bg.sticky":   "black",
    "bg.selected": "gray",
    "bg.code":     "black",

    "text.primary":   "brightWhite",
    "text.secondary": "white",
    "text.tertiary":  "gray",
    "text.disabled":  "gray",
    "text.inverse":   "black",

    "brand.primary": "brightBlue",
    "brand.accent":  "brightMagenta",

    "status.success": "brightGreen",
    "status.warning": "brightYellow",
    "status.error":   "brightRed",
    "status.info":    "brightBlue",

    "border.default": "gray",
    "border.active":  "brightBlue",
    "border.divider": "gray",
    "border.subtle":  "gray",

    "syntax.keyword":  "brightMagenta",
    "syntax.string":   "brightGreen",
    "syntax.number":   "brightYellow",
    "syntax.comment":  "gray",
    "syntax.function": "brightBlue",
    "syntax.type":     "cyan",
    "syntax.operator": "brightWhite",
    "syntax.constant": "brightYellow",
  },
};
