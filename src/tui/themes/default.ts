/**
 * Default dark theme using true color (24-bit RGB).
 */
import { rgb, bold, dim, italic, underline, cyan, green, yellow, red, magenta, blue } from "../core/ansi.js";
import type { Theme } from "./theme.js";

export const defaultTheme: Theme = {
  primary: cyan,
  secondary: blue,
  success: green,
  warning: yellow,
  error: red,
  dim: dim,
  bold: bold,
  italic: italic,
  underline: underline,

  agentColors: [
    cyan,
    green,
    magenta,
    yellow,
    blue,
    rgb(255, 165, 0),  // orange
    rgb(147, 112, 219), // medium purple
    rgb(0, 206, 209),   // dark turquoise
  ],

  border: {
    h: "─",
    v: "│",
    tl: "┌",
    tr: "┐",
    bl: "└",
    br: "┘",
  },

  symbols: {
    spinner: ["◒", "◐", "◓", "◑"],
    success: "✓",
    error: "✗",
    warning: "⚠",
    arrow: "→",
    bullet: "●",
    pending: "○",
    selected: "❯",
  },

  markdown: {
    heading: (s) => bold(cyan(s)),
    code: (s) => `\x1b[48;5;236m${s}\x1b[49m`, // dark gray background
    codeBlock: (s) => `\x1b[48;5;236m${s}\x1b[49m`,
    link: (s) => underline(cyan(s)),
    blockquote: (s) => dim(`│ ${s}`),
  },
};
