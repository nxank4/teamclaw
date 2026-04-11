/**
 * Shared status indicators — single source of truth for status dots
 * and inline loading spinners across all TUI views.
 */
import { ctp } from "../themes/default.js";

// ── Status Dots ──────────────────────────────────────────────────

const STATUS_DOT = {
  active:       { symbol: "\u25cf", color: ctp.green },     // ● green — currently in use
  configured:   { symbol: "\u25cf", color: ctp.yellow },    // ● yellow — set up but not active
  offline:      { symbol: "\u25cf", color: ctp.overlay0 },  // ● dim — unreachable
  unconfigured: { symbol: "\u25cb", color: ctp.overlay0 },  // ○ dim — not set up
  error:        { symbol: "\u25cf", color: ctp.red },       // ● red — failed
  ready:        { symbol: "\u25cf", color: ctp.blue },      // ● blue — ready, not yet connected
  connecting:   { symbol: "\u25d0", color: ctp.overlay0 },  // ◐ dim — connecting
} as const;

export type StatusDotKind = keyof typeof STATUS_DOT;

/** Raw dot symbols (uncolored) for contexts where color is applied externally. */
export const DOT_SYMBOL = {
  filled: "\u25cf",      // ●
  empty:  "\u25cb",      // ○
  half:   "\u25d0",      // ◐
} as const;

/** Render a colored status dot for the given status. */
export function statusDot(status: StatusDotKind): string {
  const s = STATUS_DOT[status];
  return s.color(s.symbol);
}

// ── Inline Spinner ───────────────────────────────────────────────

const BRAILLE_FRAMES = ["\u280b", "\u2819", "\u2839", "\u2838", "\u283c", "\u2834", "\u2826", "\u2827", "\u2807", "\u280f"];
// ⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏

export interface InlineSpinner {
  /** Returns the current spinner frame string (colored). */
  frame(): string;
  /** Stops the animation interval. Must be called to avoid leaks. */
  stop(): void;
}

/**
 * Create a lightweight inline spinner that auto-advances every 80ms.
 * Call `frame()` each render to get the current character.
 * Call `stop()` when loading is complete.
 */
export function createSpinner(colorFn?: (s: string) => string): InlineSpinner {
  const color = colorFn ?? ctp.teal;
  let idx = 0;

  const timer = setInterval(() => { idx++; }, 80);
  // Don't block process exit
  if (timer.unref) timer.unref();

  return {
    frame() {
      return color(BRAILLE_FRAMES[idx % BRAILLE_FRAMES.length]!);
    },
    stop() {
      clearInterval(timer);
    },
  };
}
