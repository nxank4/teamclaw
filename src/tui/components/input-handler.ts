/**
 * Composable text input handler — any component can delegate key events
 * here to get consistent text-editing behavior.
 *
 * Usage:
 *   const result = handleTextInput(event, text, cursor);
 *   if (result.handled) { text = result.text; cursor = result.cursor; }
 *   else { // handle component-specific keys (Enter, Escape, etc.) }
 */
import type { KeyEvent } from "../core/input.js";
import {
  identifyShortcut,
  applyShortcut,
  type TextBuffer,
  type ShortcutAction,
} from "../keybindings/input-shortcuts.js";

export interface TextInputResult extends TextBuffer {
  /** Whether the key was handled as a text-editing shortcut. */
  handled: boolean;
  /** The shortcut action that was applied, if any. */
  action?: ShortcutAction;
}

/**
 * Handle a key event as text input. Checks against all centralized
 * shortcuts, then falls back to plain character insertion.
 *
 * Returns { text, cursor, handled }. If handled is false, the
 * component should process the key itself (Enter, Escape, etc.).
 */
export function handleTextInput(
  event: KeyEvent,
  text: string,
  cursor: number,
): TextInputResult {
  // 1. Check for a recognized shortcut
  const action = identifyShortcut(event);
  if (action) {
    const pasteText = event.type === "paste" ? event.text : undefined;
    const result = applyShortcut(action, { text, cursor }, pasteText);

    // selectAll is recognized but not a buffer op — let the component handle it
    if (action === "selectAll") {
      return { text, cursor, handled: true, action };
    }

    return { ...result, handled: true, action };
  }

  // 2. Plain character insertion (non-ctrl, non-alt)
  if (event.type === "char" && !event.ctrl && !event.alt) {
    const newText = text.slice(0, cursor) + event.char + text.slice(cursor);
    return { text: newText, cursor: cursor + 1, handled: true };
  }

  // 3. Not a text-editing key — component should handle
  return { text, cursor, handled: false };
}

/**
 * Simplified handler for filter-style inputs that have no cursor
 * (text is always appended/trimmed from the end).
 *
 * Supports: char append, backspace, Ctrl+W (delete word), Ctrl+U (clear all).
 * Returns { text, handled }.
 */
export function handleFilterInput(
  event: KeyEvent,
  filterText: string,
): { text: string; handled: boolean } {
  // Ctrl+U: clear entire filter
  if (event.type === "char" && event.ctrl && event.char === "u") {
    return { text: "", handled: true };
  }

  // Ctrl+W: delete last word from filter
  if (event.type === "char" && event.ctrl && event.char === "w") {
    let i = filterText.length;
    // Skip trailing spaces
    while (i > 0 && filterText[i - 1] === " ") i--;
    // Skip word chars
    while (i > 0 && filterText[i - 1] !== " ") i--;
    return { text: filterText.slice(0, i), handled: true };
  }

  // Backspace: remove last char
  if (event.type === "backspace" && filterText.length > 0) {
    return { text: filterText.slice(0, -1), handled: true };
  }

  // Regular char: append
  if (event.type === "char" && !event.ctrl && !event.alt) {
    return { text: filterText + event.char, handled: true };
  }

  return { text: filterText, handled: false };
}
