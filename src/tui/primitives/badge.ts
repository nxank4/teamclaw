/**
 * Badge and symbol rendering — consistent icons for agents, statuses, and modes.
 */
import { defaultTheme, ctp } from "../themes/default.js";
import { bold } from "../core/ansi.js";
import { ICONS } from "../constants/icons.js";

// ─── Agent colors ───────────────────────────────────────────────────────────

const AGENT_COLOR_MAP: Record<string, (s: string) => string> = {
  coder: ctp.teal,
  reviewer: ctp.peach,
  planner: ctp.sapphire,
  tester: ctp.mauve,
  debugger: ctp.red,
  researcher: ctp.sky,
  assistant: ctp.lavender,
};

export function getAgentColor(agentId: string): (s: string) => string {
  const lower = agentId.toLowerCase();
  return AGENT_COLOR_MAP[lower] ?? defaultTheme.agentColors[hashIndex(lower, defaultTheme.agentColors.length)] ?? ctp.lavender;
}

export function agentBadge(agentName: string): string {
  const color = getAgentColor(agentName);
  return color(ICONS.diamond) + " " + bold(color(agentName));
}

// ─── Status badges ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { icon: string; color: (s: string) => string }> = {
  success: { icon: defaultTheme.symbols.success, color: ctp.green },
  error:   { icon: defaultTheme.symbols.error,   color: ctp.red },
  warning: { icon: defaultTheme.symbols.warning,  color: ctp.yellow },
  info:    { icon: defaultTheme.symbols.bullet,   color: ctp.teal },
  pending: { icon: defaultTheme.symbols.pending,  color: ctp.overlay1 },
};

export function statusBadge(status: "success" | "error" | "warning" | "info" | "pending"): string {
  const cfg = STATUS_CONFIG[status]!;
  return cfg.color(cfg.icon);
}

// ─── Mode badges ────────────────────────────────────────────────────────────

export function modeBadge(icon: string, shortName: string, color: (s: string) => string): string {
  return color(icon + " " + shortName);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function hashIndex(s: string, len: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h) % len;
}
