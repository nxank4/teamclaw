/**
 * StickyRegionComponent — a dynamic-height fixed-bottom strip pinned
 * above the editor. Renders the active sticky block (if any) with a
 * 100ms Braille spinner and auto-collapse at ⌊H/3⌋ rows.
 *
 * Producers (slash commands, router-wiring) call
 * `getStickyRegion().mount(content)` and receive a stable
 * StickyBlockHandle. The handle's `update`, `complete`, and `unmount`
 * methods drive the lifecycle without needing access to the TUI or
 * layout.
 */
import type { Component } from "../../core/component.js";
import { tokens } from "../../themes/tokens.js";
import type { StickyBlockContent, StickyPrefix } from "./sticky-block.js";
import { renderStickyBlock } from "./sticky-block.js";
import { StickyStack, type QueueEntry } from "./sticky-stack.js";
import { SpinnerTimer } from "./spinner.js";

export type { StickyBlockContent, StickyItem, StickyItemStatus, StickyPrefix } from "./sticky-block.js";

const COMPLETE_GRACE_MS = 1500;
const AUTO_COLLAPSE_DIVISOR = 3;

export interface StickyBlockHandle {
  /** Mutate visible content. Triggers a single fixed-region re-render. */
  update(patch: Partial<StickyBlockContent>): void;
  /**
   * Mark the block done. Shows `✓ <summary>` for COMPLETE_GRACE_MS,
   * then unmounts and writes a "→ <noun>: <summary>" line to chat.
   * `logKind` overrides the default noun (derived from the block's prefix).
   */
  complete(summary: string, logKind?: StickyPrefix): void;
  /** Pop without writing a completion line. */
  unmount(): void;
}

export interface StickyRegionDeps {
  /** Re-render only the fixed-bottom area (fast path). */
  requestFixedRender(): void;
  /** Append a chat message — used by the completion path. */
  addMessage(role: string, content: string): void;
}

export class StickyRegionComponent implements Component {
  readonly id = "sticky-region";
  hidden = false;

  private readonly stack = new StickyStack();
  private readonly spinner: SpinnerTimer;
  private terminalRows = 24;

  /** Pending grace-period timer for the head block. */
  private graceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: StickyRegionDeps) {
    this.spinner = new SpinnerTimer(() => this.deps.requestFixedRender());
  }

  /**
   * Called by the TUI engine when the scrollable viewport changes. We
   * stash terminalRows so the auto-collapse rule has fresh row counts
   * after a resize.
   */
  setViewport(_scrollableHeight: number, _scrollOffset: number, totalRows?: number): void {
    if (totalRows && totalRows > 0) this.terminalRows = totalRows;
  }

  /** Called by the TUI on every render pass. Returns [] when no block is active. */
  render(width: number): string[] {
    const head = this.stack.head();
    if (!head) return [];

    const maxRows = Math.max(3, Math.floor(this.terminalRows / AUTO_COLLAPSE_DIVISOR));
    return renderStickyBlock(head.content, this.spinner.frameIndex(), width, maxRows);
  }

  /**
   * Mount a new sticky block. Becomes visible immediately if the stack
   * is empty; otherwise queues behind the current head.
   */
  mount(content: StickyBlockContent): StickyBlockHandle {
    const entry = this.stack.enqueue(content);
    if (this.stack.size() === 1) this.spinner.start();
    this.deps.requestFixedRender();
    return this.makeHandle(entry);
  }

  /** Visible for tests: live entry count (excludes cancelled). */
  size(): number {
    return this.stack.size();
  }

  /** Visible for tests: true when the spinner timer is running. */
  spinnerRunning(): boolean {
    return this.spinner.running();
  }

  private makeHandle(entry: QueueEntry): StickyBlockHandle {
    return {
      update: (patch) => {
        if (entry.cancelled) return;
        entry.content = { ...entry.content, ...patch };
        // If this entry is the head, the visible strip changes; otherwise
        // the patch is just buffered for when it gets promoted.
        if (this.stack.head() === entry) {
          this.deps.requestFixedRender();
        }
      },
      complete: (summary, logKind) => {
        if (entry.cancelled) return;
        // 1) swap content to a single ✓-prefixed line via an `items` patch
        const completedItem = { status: "done" as const, label: summary };
        entry.content = {
          ...entry.content,
          items: [completedItem],
          footer: undefined,
          spinner: false,
        };
        if (this.stack.head() === entry) this.deps.requestFixedRender();

        // 2) schedule chat-log + unmount after grace
        this.scheduleGrace(entry, summary, logKind);
      },
      unmount: () => {
        if (entry.cancelled) return;
        this.cancelEntry(entry);
      },
    };
  }

  private scheduleGrace(entry: QueueEntry, summary: string, logKind?: StickyPrefix): void {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null;
      this.writeChatLine(entry, summary, logKind);
      this.cancelEntry(entry);
    }, COMPLETE_GRACE_MS);
    if (this.graceTimer.unref) this.graceTimer.unref();
  }

  private cancelEntry(entry: QueueEntry): void {
    this.stack.cancel(entry.id);
    // If this was the head, promote the next entry (or stop the spinner).
    if (this.stack.size() === 0) {
      this.spinner.stop();
    }
    this.deps.requestFixedRender();
  }

  private writeChatLine(entry: QueueEntry, summary: string, logKind?: StickyPrefix): void {
    const kind = logKind ?? entry.content.prefix;
    const noun = kind.replace(/^op:/, "");
    const line = tokens.picker.hint(`→ ${noun}: `) + tokens.ui.brandPrimary(summary);
    this.deps.addMessage("system", line);
  }
}

// ── Module-level singleton accessor ────────────────────────────────
// Producers call getStickyRegion() without threading the layout.

let _instance: StickyRegionComponent | null = null;

export function setStickyRegion(region: StickyRegionComponent): void {
  _instance = region;
}

export function getStickyRegion(): StickyRegionComponent {
  if (!_instance) {
    throw new Error(
      "StickyRegion not initialized. Call setStickyRegion() from app/layout.ts before producers run.",
    );
  }
  return _instance;
}

/** Test-only: clear the singleton between cases. */
export function _resetStickyRegion(): void {
  _instance = null;
}
