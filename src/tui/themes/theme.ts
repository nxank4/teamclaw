/**
 * Theme interface — defines all colors, borders, and symbols used by components.
 */

/** A styling function that wraps a string with ANSI codes. */
export type StyleFn = (s: string) => string;

export interface Theme {
  // Semantic colors
  primary: StyleFn;
  secondary: StyleFn;
  success: StyleFn;
  warning: StyleFn;
  error: StyleFn;
  dim: StyleFn;
  bold: StyleFn;
  italic: StyleFn;
  underline: StyleFn;

  // Cycling colors for multi-agent display
  agentColors: StyleFn[];

  // Box-drawing characters
  border: {
    h: string;   // horizontal
    v: string;   // vertical
    tl: string;  // top-left
    tr: string;  // top-right
    bl: string;  // bottom-left
    br: string;  // bottom-right
  };

  // UI symbols
  symbols: {
    spinner: string[];   // animation frames
    success: string;     // ✓
    error: string;       // ✗
    warning: string;     // ⚠
    arrow: string;       // →
    bullet: string;      // ●
    pending: string;     // ○
    selected: string;    // ❯
  };

  // Markdown rendering styles
  markdown: {
    heading: StyleFn;
    code: StyleFn;
    codeBlock: StyleFn;
    link: StyleFn;
    blockquote: StyleFn;
  };

  // Chat bubble styles
  userBubble: StyleFn;
  agentName: StyleFn;
  agentResponseBg: StyleFn;
  toolApprovalBg: StyleFn;

  // Status bar
  statusBarBg: StyleFn;
  statusMode: StyleFn;
  statusWorking: StyleFn;

  // Logo / splash
  logo: StyleFn;
  logoBorder: StyleFn;
}
