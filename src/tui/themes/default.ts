/**
 * Legacy `Theme` shim. Synthesizes the old `Theme` interface from the
 * new tokens — existing `defaultTheme.X` callsites keep working and
 * pick up theme switches automatically via the reactive tokens Proxy.
 *
 * Slated for deletion alongside the `Theme` interface once every
 * caller migrates to the tokens API. Kept as a separate file (not
 * folded into active.ts) so the import graph stays acyclic:
 * tokens.ts depends on active.ts, default.ts depends on both.
 */
import { tokens, bgToken } from "./tokens.js";
import { bold, italic, underline } from "../core/ansi.js";
import { ICONS } from "../constants/icons.js";
import type { Theme, StyleFn } from "./theme.js";

const agentColors: StyleFn[] = [
  tokens.agent.coder,
  tokens.agent.reviewer,
  tokens.agent.debugger,
  tokens.agent.tester,
  tokens.agent.planner,
  tokens.agent.researcher,
  tokens.agent.assistant,
  tokens.agent.fallback,
];

export const defaultTheme: Theme = {
  primary: tokens.ui.brandPrimary,
  secondary: tokens.ui.textSecondary,
  success: tokens.badge.success,
  warning: tokens.badge.warning,
  error: tokens.badge.error,
  info: tokens.badge.info,
  accent: tokens.ui.brandAccent,
  dim: tokens.ui.textTertiary,
  muted: tokens.chat.systemHelp,
  bold,
  italic,
  underline,
  agentColors,
  border: { h: "─", v: "│", tl: "┌", tr: "┐", bl: "└", br: "┘" },
  symbols: {
    spinner: ICONS.spinnerFrames as unknown as string[],
    success: ICONS.success,
    error: ICONS.error,
    warning: ICONS.warning,
    arrow: ICONS.arrow,
    bullet: ICONS.dotFilled,
    pending: ICONS.dotEmpty,
    selected: "❯",
  },
  markdown: {
    heading: (s) => bold(tokens.md.h1(s)),
    code: tokens.md.inlineCode,
    codeBlock: tokens.ui.textPrimary,
    link: tokens.md.link,
    blockquote: (s) => tokens.md.blockquoteText(`│ ${s}`),
  },
  userBubble: tokens.ui.textPrimary,
  agentName: (s) => bold(tokens.chat.agentName(s)),
  agentResponseBg: bgToken("elevated"),
  toolApprovalBg: bgToken("selected"),
  statusBarBg: bgToken("elevated"),
  statusMode: tokens.ui.brandPrimary,
  statusWorking: tokens.ui.brandAccent,
  logo: tokens.ui.brandPrimary,
  logoBorder: tokens.panel.border,
};

/** Compat — no-op; legacy theme-engine.switchTheme still calls this. */
export function setActiveTheme(_theme: Theme): void {
  // The new system swaps via setActivePalette; this shim exists only
  // so the engine's legacy code path stays compiling until commit 11
  // deletes it. defaultTheme is reactive via tokens, so nothing to do.
}
