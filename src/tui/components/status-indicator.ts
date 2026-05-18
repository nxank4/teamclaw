/**
 * Shared status indicators — single source of truth for status dots
 * and inline loading spinners across all TUI views.
 */
import { tokens } from "../themes/tokens.js";
import { ICONS } from "../constants/icons.js";

// ── Status Dots ──────────────────────────────────────────────────

const STATUS_DOT = {
  active:       { symbol: ICONS.dotFilled, color: tokens.status.dotActive },
  configured:   { symbol: ICONS.dotFilled, color: tokens.status.dotConfigured },
  offline:      { symbol: ICONS.dotFilled, color: tokens.status.dotOffline },
  unconfigured: { symbol: ICONS.dotEmpty,  color: tokens.status.dotOffline },
  error:        { symbol: ICONS.dotFilled, color: tokens.status.dotError },
  ready:        { symbol: ICONS.dotFilled, color: tokens.status.dotReady },
  connecting:   { symbol: ICONS.dotHalf,   color: tokens.status.dotConnecting },
} as const;

export type StatusDotKind = keyof typeof STATUS_DOT;

/** Raw dot symbols (uncolored) for contexts where color is applied externally. */
export const DOT_SYMBOL = {
  filled: ICONS.dotFilled,  // ●
  empty:  ICONS.dotEmpty,   // ○
  half:   ICONS.dotHalf,    // ◐
} as const;

/** Render a colored status dot for the given status. */
export function statusDot(status: StatusDotKind): string {
  const s = STATUS_DOT[status];
  return s.color(s.symbol);
}

// ── Inline Spinner ───────────────────────────────────────────────

/**
 * Cadence shared with the top-level ThinkingIndicator and the
 * tree-node spinner — every animated symbol in the TUI ticks at the
 * same 200ms beat so two visible spinners can never drift out of
 * phase. PR #119 introduced the 4-frame box at 200ms; PR #120 unifies
 * the rest of the TUI on the same cadence.
 */
export const SPINNER_INTERVAL_MS = 200;

const SPINNER_FRAMES = ICONS.boxFrames;

export interface InlineSpinner {
  /** Returns the current spinner frame string (colored). */
  frame(): string;
  /** Stops the animation interval. Must be called to avoid leaks. */
  stop(): void;
}

/**
 * Create a lightweight inline spinner that auto-advances at the
 * shared cadence. Call `frame()` each render to get the current
 * character. Call `stop()` when loading is complete.
 */
export function createSpinner(colorFn?: (s: string) => string): InlineSpinner {
  const color = colorFn ?? tokens.status.spinnerDefault;
  let idx = 0;

  const timer = setInterval(() => { idx++; }, SPINNER_INTERVAL_MS);
  // Don't block process exit
  if (timer.unref) timer.unref();

  return {
    frame() {
      return color(SPINNER_FRAMES[idx % SPINNER_FRAMES.length]!);
    },
    stop() {
      clearInterval(timer);
    },
  };
}
