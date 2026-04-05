/**
 * Leader key handler — two-key shortcut system.
 * Default leader: Ctrl+X. User presses leader, then a second key to trigger an action.
 * Double-leader (Ctrl+X Ctrl+X) opens command palette.
 */

export interface LeaderBinding {
  secondKey: string;
  action: string;
  handler: () => void;
  description: string;
}

export type LeaderKeyResult =
  | { consumed: true; action: string }
  | { consumed: true; waiting: true }
  | { consumed: false };

export class LeaderKeyHandler {
  private leaderCombo: string;
  private awaiting = false;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private bindings = new Map<string, LeaderBinding>();
  private timeoutMs: number;

  /** Called when leader sequence times out or unknown key pressed. */
  onFeedback?: (msg: string) => void;
  /** Called when double-leader triggers palette. */
  onPalette?: () => void;

  constructor(config?: { leader?: string; timeoutMs?: number }) {
    this.leaderCombo = config?.leader ?? "ctrl+x";
    this.timeoutMs = config?.timeoutMs ?? 2000;
  }

  register(secondKey: string, action: string, handler: () => void, description = ""): void {
    this.bindings.set(secondKey.toLowerCase(), { secondKey, action, handler, description });
  }

  handleKey(combo: string): LeaderKeyResult {
    const normalized = combo.toLowerCase();

    if (this.awaiting) {
      this.clearTimeout();
      this.awaiting = false;

      // Double-leader → palette
      if (normalized === this.leaderCombo) {
        this.onPalette?.();
        return { consumed: true, action: "palette:show" };
      }

      // Escape → cancel
      if (normalized === "escape") {
        return { consumed: true, action: "leader:cancel" };
      }

      // Look up binding
      const binding = this.bindings.get(normalized);
      if (binding) {
        binding.handler();
        return { consumed: true, action: binding.action };
      }

      // Unknown key
      this.onFeedback?.(`Unknown: ${this.leaderCombo} ${combo}`);
      return { consumed: true, action: "leader:unknown" };
    }

    // Check if this is the leader key
    if (normalized === this.leaderCombo) {
      this.awaiting = true;
      this.timeout = setTimeout(() => {
        this.awaiting = false;
        this.onFeedback?.("Leader key timed out");
      }, this.timeoutMs);
      return { consumed: true, waiting: true };
    }

    return { consumed: false };
  }

  cancel(): void {
    this.clearTimeout();
    this.awaiting = false;
  }

  isAwaitingSecondKey(): boolean {
    return this.awaiting;
  }

  getBindings(): LeaderBinding[] {
    return [...this.bindings.values()];
  }

  getLeaderCombo(): string {
    return this.leaderCombo;
  }

  private clearTimeout(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}
