/**
 * Centralized text-editing shortcuts — single source of truth for all
 * input components (prompt editor, settings editor, filter inputs, etc.).
 *
 * Defines shortcuts, a matcher, and buffer operations so every text input
 * behaves identically without duplicating logic.
 */
import type { KeyEvent } from "../core/input.js";
import { ICONS } from "../constants/icons.js";

// ── Shortcut definitions ──────────────────────────────────────────────

export interface InputShortcut {
  /** KeyEvent type to match. Default "char". */
  eventType?: KeyEvent["type"];
  /** Character to match (for type "char"). */
  char?: string;
  ctrl?: boolean;
  alt?: boolean;
  /** Human-readable label for display. */
  label: string;
  /** Description shown in /hotkeys. */
  description: string;
}

export const INPUT_SHORTCUTS = {
  // ── Cursor movement ──
  moveLeft:         { eventType: "arrow", char: "left",  label: ICONS.arrowLeft,          description: "Move cursor left" },
  moveRight:        { eventType: "arrow", char: "right", label: ICONS.arrow,          description: "Move cursor right" },
  moveWordLeft:     { eventType: "arrow", char: "left",  ctrl: true, label: `Ctrl+${ICONS.arrowLeft}`,    description: "Move to previous word" },
  moveWordRight:    { eventType: "arrow", char: "right", ctrl: true, label: `Ctrl+${ICONS.arrow}`,    description: "Move to next word" },
  moveLineStart:    { eventType: "home",                 label: "Home",       description: "Move to start of line" },
  moveLineEnd:      { eventType: "end",                  label: "End",        description: "Move to end of line" },
  moveToEnd:        { eventType: "char", char: "e", ctrl: true, label: "Ctrl+E", description: "Move to end of text" },

  // ── Deletion ──
  deleteCharLeft:   { eventType: "backspace",            label: "Backspace",  description: "Delete character left" },
  deleteCharRight:  { eventType: "delete",               label: "Delete",     description: "Delete character right" },
  deleteWordLeft:   { eventType: "char", char: "w", ctrl: true, label: "Ctrl+W", description: "Delete previous word" },
  clearToStart:     { eventType: "char", char: "u", ctrl: true, label: "Ctrl+U", description: "Delete to start of line" },
  clearToEnd:       { eventType: "char", char: "k", ctrl: true, label: "Ctrl+K", description: "Delete to end of line" },

  // ── Selection ──
  selectAll:        { eventType: "char", char: "a", ctrl: true, label: "Ctrl+A", description: "Select all text" },

  // ── Input ──
  paste:            { eventType: "paste",                label: "Paste",      description: "Paste from clipboard" },
} as const;

export type ShortcutAction = keyof typeof INPUT_SHORTCUTS;

/**
 * Check if a KeyEvent matches a shortcut definition.
 */
export function matchShortcut(event: KeyEvent, shortcut: InputShortcut): boolean {
  // Match event type
  const expectedType = shortcut.eventType ?? "char";
  if (event.type !== expectedType) return false;

  // For arrow events, match direction
  if (event.type === "arrow" && shortcut.char) {
    if (event.direction !== shortcut.char) return false;
    if (shortcut.ctrl && !event.ctrl) return false;
    if (!shortcut.ctrl && event.ctrl) return false;
    return true;
  }

  // For char events, match character and modifiers
  if (event.type === "char" && shortcut.eventType === "char") {
    if (shortcut.char && event.char !== shortcut.char) return false;
    if (shortcut.ctrl && !event.ctrl) return false;
    if (!shortcut.ctrl && event.ctrl) return false;
    if (shortcut.alt && !event.alt) return false;
    return true;
  }

  // Simple type-only match (backspace, delete, home, end, paste)
  return true;
}

/**
 * Identify which shortcut action (if any) a KeyEvent matches.
 * Returns the action name or null.
 */
export function identifyShortcut(event: KeyEvent): ShortcutAction | null {
  for (const [action, shortcut] of Object.entries(INPUT_SHORTCUTS)) {
    if (matchShortcut(event, shortcut)) {
      return action as ShortcutAction;
    }
  }
  return null;
}

// ── Buffer operations ─────────────────────────────────────────────────

export interface TextBuffer {
  text: string;
  cursor: number;
}

/** Jump cursor to start of previous word (space-delimited). */
export function wordBoundaryLeft(text: string, cursor: number): number {
  if (cursor === 0) return 0;
  let i = cursor - 1;
  // Skip trailing spaces
  while (i > 0 && text[i - 1] === " ") i--;
  // Skip word characters
  while (i > 0 && text[i - 1] !== " ") i--;
  return i;
}

/** Jump cursor to start of next word (space-delimited). */
export function wordBoundaryRight(text: string, cursor: number): number {
  if (cursor >= text.length) return text.length;
  let i = cursor;
  // Skip current word
  while (i < text.length && text[i] !== " ") i++;
  // Skip spaces
  while (i < text.length && text[i] === " ") i++;
  return i;
}

/**
 * Apply a shortcut action to a text buffer. Returns the modified buffer.
 * For actions that don't apply to a simple text+cursor (like selectAll),
 * returns the buffer unchanged — the component handles those.
 */
export function applyShortcut(
  action: ShortcutAction,
  buf: TextBuffer,
  /** Paste text (only used for "paste" action). */
  pasteText?: string,
): TextBuffer {
  const { text, cursor } = buf;

  switch (action) {
    // ── Cursor movement ──
    case "moveLeft":
      return { text, cursor: Math.max(0, cursor - 1) };
    case "moveRight":
      return { text, cursor: Math.min(text.length, cursor + 1) };
    case "moveWordLeft":
      return { text, cursor: wordBoundaryLeft(text, cursor) };
    case "moveWordRight":
      return { text, cursor: wordBoundaryRight(text, cursor) };
    case "moveLineStart":
      return { text, cursor: 0 };
    case "moveLineEnd":
      return { text, cursor: text.length };
    case "moveToEnd":
      return { text, cursor: text.length };

    // ── Deletion ──
    case "deleteCharLeft":
      if (cursor === 0) return buf;
      return { text: text.slice(0, cursor - 1) + text.slice(cursor), cursor: cursor - 1 };
    case "deleteCharRight":
      if (cursor >= text.length) return buf;
      return { text: text.slice(0, cursor) + text.slice(cursor + 1), cursor };
    case "deleteWordLeft": {
      const newCursor = wordBoundaryLeft(text, cursor);
      return { text: text.slice(0, newCursor) + text.slice(cursor), cursor: newCursor };
    }
    case "clearToStart":
      return { text: text.slice(cursor), cursor: 0 };
    case "clearToEnd":
      return { text: text.slice(0, cursor), cursor };

    // ── Input ──
    case "paste":
      if (!pasteText) return buf;
      return { text: text.slice(0, cursor) + pasteText + text.slice(cursor), cursor: cursor + pasteText.length };

    // ── Selection (component-level, not buffer-level) ──
    case "selectAll":
      return buf;

    default:
      return buf;
  }
}

/**
 * Get all shortcuts for display in /hotkeys.
 */
export function getInputShortcutsForDisplay(): Array<{ keys: string; description: string }> {
  return Object.values(INPUT_SHORTCUTS)
    .filter((s) => s.label !== ICONS.arrowLeft && s.label !== ICONS.arrow && s.label !== "Backspace" && s.label !== "Paste")
    .map((s) => ({ keys: s.label, description: s.description }));
}
