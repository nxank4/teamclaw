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

  // Chat bubbles
  userBubble: (s) => `\x1b[97;48;2;35;65;115m${s}\x1b[0m`,    // white on dark blue
  agentName: (s) => `\x1b[1;38;2;100;210;210m${s}\x1b[0m`,     // bold teal

  // Status bar
  statusBarBg: (s) => `\x1b[48;2;25;25;35m${s}\x1b[0m`,       // very dark bg
  statusMode: (s) => `\x1b[38;2;100;200;220m${s}\x1b[0m`,     // cyan
  statusWorking: (s) => `\x1b[38;2;240;200;80m${s}\x1b[0m`,   // warm yellow

  // Logo / splash
  logo: (s) => `\x1b[38;2;80;200;200m${s}\x1b[0m`,            // teal
  logoBorder: (s) => `\x1b[38;2;50;50;70m${s}\x1b[0m`,        // dim border
};
