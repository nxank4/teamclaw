/**
 * Shared navigation helpers — vertical arrow-key clamping and
 * y/n confirmation key handling.
 */

import type { KeyEvent } from "./input.js";

/**
 * Handle up/down arrow keys with index clamping or optional wrap-around.
 * Returns the new index and whether the event was consumed.
 */
export function handleVerticalNav(
  event: KeyEvent,
  currentIndex: number,
  itemCount: number,
  options?: { wrapAround?: boolean },
): { index: number; handled: boolean } {
  if (event.type !== "arrow" || (event.direction !== "up" && event.direction !== "down")) {
    return { index: currentIndex, handled: false };
  }
  if (itemCount <= 0) {
    return { index: currentIndex, handled: true };
  }

  const wrap = options?.wrapAround ?? false;

  if (event.direction === "up") {
    const index = wrap && currentIndex <= 0
      ? itemCount - 1
      : Math.max(0, currentIndex - 1);
    return { index, handled: true };
  }

  // down
  const index = wrap && currentIndex >= itemCount - 1
    ? 0
    : Math.min(itemCount - 1, currentIndex + 1);
  return { index, handled: true };
}

/**
 * Handle y/n confirmation keys.
 * Returns "confirm" for y/Y/Enter, "cancel" for n/N/Escape, null otherwise.
 */
export function handleConfirmationKey(event: KeyEvent): "confirm" | "cancel" | null {
  if (event.type === "char" && !event.ctrl) {
    const ch = event.char.toLowerCase();
    if (ch === "y") return "confirm";
    if (ch === "n") return "cancel";
  }
  if (event.type === "enter") return "confirm";
  if (event.type === "escape") return "cancel";
  return null;
}
