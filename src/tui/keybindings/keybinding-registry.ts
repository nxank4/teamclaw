/**
 * Central keybinding management with input mode stack.
 */

export type InputMode = "normal" | "permission" | "autocomplete" | "panel" | "session_picker" | "search" | "vim_normal" | "vim_visual";
export type KeyModifiers = { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean };
export type KeybindingCategory = "session" | "navigation" | "display" | "editing" | "tools";

export interface KeybindingDefinition {
  key: string;
  action: string;
  handler: () => void | Promise<void>;
  description: string;
  category: KeybindingCategory;
  modes: InputMode[];
  configurable: boolean;
}

export class KeybindingRegistry {
  private bindings = new Map<string, KeybindingDefinition>();
  private modeStack: InputMode[] = ["normal"];

  register(binding: KeybindingDefinition): void {
    this.bindings.set(binding.key, binding);
  }

  unregister(key: string): void {
    this.bindings.delete(key);
  }

  handleKey(key: string, _modifiers?: KeyModifiers): boolean {
    const binding = this.bindings.get(key);
    if (!binding) return false;

    const currentMode = this.getCurrentMode();
    if (!binding.modes.includes(currentMode)) return false;

    void binding.handler();
    return true;
  }

  getAll(): KeybindingDefinition[] {
    return [...this.bindings.values()];
  }

  getActiveBindings(): KeybindingDefinition[] {
    const mode = this.getCurrentMode();
    return this.getAll().filter((b) => b.modes.includes(mode));
  }

  pushMode(mode: InputMode): void {
    this.modeStack.push(mode);
  }

  popMode(): void {
    if (this.modeStack.length > 1) this.modeStack.pop();
  }

  getCurrentMode(): InputMode {
    return this.modeStack[this.modeStack.length - 1] ?? "normal";
  }
}
