/**
 * Keybinding registry — resolves KeyEvents to ActionIds.
 * Supports presets, user overrides, and context-sensitive resolution.
 */
import { PRESETS, type PresetName, type KeyCombo } from "./keymap-presets.js";
import { ACTIONS, type ActionId } from "./actions.js";
import type { KeyEvent } from "../core/input.js";

export interface KeyContext {
  hasSelection: boolean;
  hasRunningTask: boolean;
  hasActiveView: boolean;
  isAutocompleteVisible: boolean;
  isEditing: boolean;
}

export class KeybindingManager {
  private bindings = new Map<string, ActionId>();
  presetName: PresetName;
  private userOverrides: Partial<Record<ActionId, KeyCombo | KeyCombo[]>> = {};

  constructor(preset: PresetName = "windows") {
    this.presetName = preset;
    this.rebuild();
  }

  loadUserConfig(overrides: Partial<Record<ActionId, KeyCombo | KeyCombo[]>>): void {
    this.userOverrides = overrides;
    this.rebuild();
  }

  setPreset(preset: PresetName): void {
    this.presetName = preset;
    this.rebuild();
  }

  /** Resolve a KeyEvent to an action, considering context. */
  resolve(event: KeyEvent, context: KeyContext): ActionId | null {
    const combo = keyEventToCombo(event);
    if (!combo) return null;

    const action = this.bindings.get(combo);
    if (!action) return null;

    return this.resolveContextual(action, context);
  }

  /** Get all bindings grouped for display. */
  getBindingsForDisplay(): { action: ActionId; keys: string[]; description: string }[] {
    const grouped = new Map<ActionId, string[]>();
    for (const [combo, action] of this.bindings) {
      if (!grouped.has(action)) grouped.set(action, []);
      grouped.get(action)!.push(combo);
    }
    return Array.from(grouped.entries()).map(([action, keys]) => ({
      action,
      keys,
      description: ACTIONS[action],
    }));
  }

  /** Get key combo string(s) for a specific action — useful for UI hints. */
  getKeysForAction(action: ActionId): string[] {
    const keys: string[] = [];
    for (const [combo, act] of this.bindings) {
      if (act === action) keys.push(combo);
    }
    return keys;
  }

  private rebuild(): void {
    this.bindings.clear();
    const preset = PRESETS[this.presetName];

    for (const [action, combos] of Object.entries(preset)) {
      const list = Array.isArray(combos) ? combos : [combos];
      for (const combo of list) {
        this.bindings.set(normalizeCombo(combo), action as ActionId);
      }
    }

    for (const [action, combos] of Object.entries(this.userOverrides)) {
      // Remove old bindings for this action
      for (const [combo, act] of this.bindings) {
        if (act === action) this.bindings.delete(combo);
      }
      const list = Array.isArray(combos) ? combos : [combos!];
      for (const combo of list) {
        this.bindings.set(normalizeCombo(combo), action as ActionId);
      }
    }
  }

  private resolveContextual(action: ActionId, ctx: KeyContext): ActionId | null {
    // Ctrl+C: copy if selection, else abort/cancel
    if (action === "editor.clipboard.copy" && !ctx.hasSelection) {
      return "app.abort";
    }

    // Up/Down: nav in views/autocomplete, history in editor
    if (action === "editor.history.prev" || action === "editor.history.next") {
      if (ctx.isAutocompleteVisible || ctx.hasActiveView) {
        return action === "editor.history.prev" ? "nav.up" : "nav.down";
      }
    }

    return action;
  }
}

/** Convert a KeyEvent to a normalized combo string, or null if unmappable. */
function keyEventToCombo(event: KeyEvent): string | null {
  const parts: string[] = [];

  if (event.type === "char") {
    if (event.ctrl) parts.push("ctrl");
    if (event.alt) parts.push("alt");
    if (event.shift && event.char === event.char.toLowerCase() && event.char.length === 1) {
      parts.push("shift");
    }
    parts.push(event.char.toLowerCase());
    return parts.join("+");
  }

  if (event.type === "arrow") {
    if (event.ctrl) parts.push("ctrl");
    if (event.alt) parts.push("alt");
    parts.push(event.direction);
    return parts.join("+");
  }

  const simpleMap: Record<string, string> = {
    enter: "enter", backspace: "backspace", delete: "delete",
    escape: "escape", home: "home", end: "end",
    pageup: "pageup", pagedown: "pagedown",
  };

  if (event.type in simpleMap) {
    parts.push(simpleMap[event.type]!);
    return parts.join("+");
  }

  if (event.type === "tab") {
    if ("shift" in event && event.shift) parts.push("shift");
    parts.push("tab");
    return parts.join("+");
  }

  return null;
}

function normalizeCombo(combo: string): string {
  return combo
    .toLowerCase()
    .split("+")
    .sort((a, b) => {
      const order: Record<string, number> = { ctrl: 0, alt: 1, shift: 2 };
      return (order[a] ?? 3) - (order[b] ?? 3);
    })
    .join("+");
}
