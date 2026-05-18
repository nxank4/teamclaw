/**
 * Interactive chat-stream block — an inline, keyboard-driven picker that
 * lives in the message history (NOT a full-screen overlay like the
 * `*View` interactive views in src/app/interactive/).
 *
 * Pattern:
 *   1. mount() emits a tagged system message and pushes a key handler.
 *   2. Arrow / j / k advances the highlight; the block re-renders in place
 *      via replaceByTag.
 *   3. Enter calls onSelect, replaces the block with a one-line summary,
 *      unmounts.
 *   4. Esc / Ctrl+C calls onCancel (if provided), removes the block
 *      entirely, unmounts.
 *   5. Typing `/` unmounts (calling onCancel) but lets the slash through
 *      to the editor so the user can start a new slash command.
 *   6. Other characters fall through to the editor unchanged.
 *
 * A module-level singleton enforces "only one interactive block active at
 * a time." Mounting a second block unmounts the first.
 */
import type { KeyEvent } from "../../core/input.js";

const PAGE_JUMP = 5;

export interface InteractiveBlockSpec<T> {
  /** Items to navigate. */
  items: readonly T[];
  /** Initial highlight (clamped to valid range; defaults to 0). */
  initialIndex?: number;
  /** Branded tag for the chat-stream message (e.g. "op:themes"). */
  tag: string;
  /**
   * Render the full block lines for a given highlight index. The
   * renderer owns the box-drawing, header, footer, and per-row token
   * styling (typically `tokens.picker.itemSelected` for the highlighted
   * row).
   */
  render: (highlightedIndex: number) => string[];
  /**
   * Called on Enter with the highlighted item. May be async — the block
   * waits for the promise before swapping in the summary line so a slow
   * persist call still produces ordered output.
   */
  onSelect: (item: T, index: number) => void | Promise<void>;
  /** Called on Esc / Ctrl+C / `/` dismiss. Optional. */
  onCancel?: () => void;
  /** One-line summary that replaces the block after Enter. */
  summary: (item: T, index: number) => string;
  /** Status-bar hint shown while mounted; restored on unmount. */
  statusHint: string;
}

export interface InteractiveBlockDeps {
  pushKeyHandler(h: { handleKey: (event: KeyEvent) => boolean }): void;
  popKeyHandler(): void;
  requestRender(): void;
  addMessage(role: string, content: string, options?: { tag?: string }): void;
  replaceByTag(tag: string, content: string): boolean;
  removeLastByTag(tag: string): boolean;
  setStatusHint(text: string): void;
  clearStatusHint(): void;
}

let _active: InteractiveBlock<unknown> | null = null;

export class InteractiveBlock<T> {
  private index = 0;
  private mounted = false;
  private handlerPushed = false;
  private readonly handler = { handleKey: (e: KeyEvent) => this.handleKey(e) };

  constructor(
    private readonly spec: InteractiveBlockSpec<T>,
    private readonly deps: InteractiveBlockDeps,
  ) {}

  mount(): void {
    if (this.mounted) return;
    if (this.spec.items.length === 0) {
      // Nothing to navigate. Don't mount; surface a single line so the
      // caller still sees feedback in chat.
      this.deps.addMessage("system", `[${this.spec.tag}] no items`, { tag: this.spec.tag });
      this.deps.requestRender();
      return;
    }

    // Singleton: unmount any previously-active block first.
    if (_active && _active !== (this as unknown as InteractiveBlock<unknown>)) {
      _active.unmount();
    }
    _active = this as unknown as InteractiveBlock<unknown>;

    const requested = this.spec.initialIndex ?? 0;
    this.index = Math.max(0, Math.min(this.spec.items.length - 1, requested));

    this.deps.addMessage("system", this.spec.render(this.index).join("\n"), { tag: this.spec.tag });
    this.deps.pushKeyHandler(this.handler);
    this.handlerPushed = true;
    this.deps.setStatusHint(this.spec.statusHint);
    this.mounted = true;
    this.deps.requestRender();
  }

  unmount(): void {
    if (!this.mounted) return;
    if (this.handlerPushed) {
      this.deps.popKeyHandler();
      this.handlerPushed = false;
    }
    this.deps.clearStatusHint();
    this.mounted = false;
    if (_active === (this as unknown as InteractiveBlock<unknown>)) {
      _active = null;
    }
  }

  /** Visible for tests; production code never calls this directly. */
  handleKey(event: KeyEvent): boolean {
    if (!this.mounted) return false;

    switch (event.type) {
      case "arrow":
        if (event.direction === "up") return this.step(-1);
        if (event.direction === "down") return this.step(1);
        return false;

      case "pageup":
        return this.pageStep(-PAGE_JUMP);

      case "pagedown":
        return this.pageStep(PAGE_JUMP);

      case "enter":
        void this.handleSelect();
        return true;

      case "escape":
        this.handleCancel();
        return true;

      case "char": {
        // Ctrl+C behaves like Esc.
        if (event.ctrl && event.char === "c") {
          this.handleCancel();
          return true;
        }
        // j / k as Vim-style nav aliases.
        if (!event.ctrl && !event.alt) {
          if (event.char === "k") return this.step(-1);
          if (event.char === "j") return this.step(1);
          // `/` dismisses the picker but reaches the editor — let the
          // user start a new slash command without first pressing Esc.
          if (event.char === "/") {
            this.handleCancel();
            return false;
          }
        }
        // All other characters pass through to the editor.
        return false;
      }

      default:
        // backspace / tab / arrow left-right / paste / etc. — fall through.
        return false;
    }
  }

  private step(delta: number): boolean {
    const n = this.spec.items.length;
    this.index = (this.index + delta + n) % n;
    this.rerender();
    return true;
  }

  private pageStep(delta: number): boolean {
    if (this.spec.items.length < PAGE_JUMP) {
      // Below the threshold, swallow the key but don't move.
      return true;
    }
    this.index = Math.max(0, Math.min(this.spec.items.length - 1, this.index + delta));
    this.rerender();
    return true;
  }

  private rerender(): void {
    const ok = this.deps.replaceByTag(this.spec.tag, this.spec.render(this.index).join("\n"));
    if (ok) this.deps.requestRender();
  }

  private async handleSelect(): Promise<void> {
    const item = this.spec.items[this.index]!;
    const idx = this.index;
    // Unmount before awaiting onSelect so the picker can't respond to
    // arrow keys while a slow callback is still resolving.
    this.unmount();
    try {
      await this.spec.onSelect(item, idx);
    } finally {
      const summary = this.spec.summary(item, idx);
      this.deps.replaceByTag(this.spec.tag, summary);
      this.deps.requestRender();
    }
  }

  private handleCancel(): void {
    this.unmount();
    this.spec.onCancel?.();
    this.deps.removeLastByTag(this.spec.tag);
    this.deps.requestRender();
  }
}

/** Test-only: clear the singleton between test cases. */
export function _resetActiveBlock(): void {
  _active = null;
}
