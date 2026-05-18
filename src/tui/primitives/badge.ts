/**
 * Badge and symbol rendering — consistent icons for agents, statuses, and modes.
 */
import { tokens } from "../themes/tokens.js";
import { bold } from "../core/ansi.js";
import { ICONS } from "../constants/icons.js";
import type { StyleFn } from "../themes/style-fn.js";

// ─── Agent colors ───────────────────────────────────────────────────────────

const AGENT_COLOR_MAP: Record<string, StyleFn> = {
  coder: tokens.agent.coder,
  reviewer: tokens.agent.reviewer,
  planner: tokens.agent.planner,
  tester: tokens.agent.tester,
  debugger: tokens.agent.debugger,
  researcher: tokens.agent.researcher,
  assistant: tokens.agent.assistant,
};

/** Cycling fallback palette for unknown agent ids. */
const AGENT_FALLBACK: StyleFn[] = [
  tokens.agent.coder,
  tokens.agent.reviewer,
  tokens.agent.planner,
  tokens.agent.tester,
  tokens.agent.researcher,
  tokens.agent.assistant,
];

export function getAgentColor(agentId: string): StyleFn {
  const lower = agentId.toLowerCase();
  const known = AGENT_COLOR_MAP[lower];
  if (known) return known;
  return AGENT_FALLBACK[hashIndex(lower, AGENT_FALLBACK.length)] ?? tokens.agent.fallback;
}

export function agentBadge(agentName: string): string {
  const color = getAgentColor(agentName);
  return color(ICONS.diamond) + " " + bold(color(agentName));
}

// ─── Status badges ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { icon: string; color: StyleFn }> = {
  success: { icon: ICONS.success,    color: tokens.badge.success },
  error:   { icon: ICONS.error,      color: tokens.badge.error },
  warning: { icon: ICONS.warning,    color: tokens.badge.warning },
  info:    { icon: ICONS.dotFilled,  color: tokens.badge.info },
  pending: { icon: ICONS.dotEmpty,   color: tokens.badge.pending },
};

export function statusBadge(status: "success" | "error" | "warning" | "info" | "pending"): string {
  const cfg = STATUS_CONFIG[status]!;
  return cfg.color(cfg.icon);
}

// ─── Mode badges ────────────────────────────────────────────────────────────

export function modeBadge(icon: string, shortName: string, color: StyleFn): string {
  return color(icon + " " + shortName);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function hashIndex(s: string, len: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h) % len;
}
