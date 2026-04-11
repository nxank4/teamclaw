/**
 * Shared scroll indicator rendering.
 * Single source of truth for "▲ N more" / "▼ N more" and "... (N more lines)".
 */

import { defaultTheme } from "../themes/default.js";
import { ICONS } from "../constants/icons.js";

/** Render a dim "▲ N more" line for items hidden above the viewport. */
export function renderScrollAbove(count: number, indent = "  "): string {
  return defaultTheme.dim(`${indent}${ICONS.scrollUp} ${count} more`);
}

/** Render a dim "▼ N more" line for items hidden below the viewport. */
export function renderScrollBelow(count: number, indent = "  "): string {
  return defaultTheme.dim(`${indent}${ICONS.scrollDown} ${count} more`);
}

/** Render a dim "... (N more lines)" truncation indicator. */
export function renderMoreLines(count: number): string {
  return defaultTheme.dim(`... (${count} more lines)`);
}

/** Compute how many items are hidden above and below a scrolled viewport. */
export function getScrollState(
  totalItems: number,
  visibleStart: number,
  visibleCount: number,
): { aboveCount: number; belowCount: number } {
  const visibleEnd = Math.min(totalItems, visibleStart + visibleCount);
  return {
    aboveCount: visibleStart,
    belowCount: totalItems - visibleEnd,
  };
}
