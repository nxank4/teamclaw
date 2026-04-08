/**
 * Differential renderer — compares previous vs current frame line-by-line,
 * only rewriting changed lines. Uses absolute cursor positioning and
 * CSI 2026 synchronized output to prevent flicker.
 *
 * Optimizations:
 * - Sparse diff: only rewrites lines that actually differ (not tail-rewrite)
 * - Single write: batches all changes into one stdout.write call
 * - Skips render entirely when nothing changed
 */
import type { Terminal } from "./terminal.js";
import { syncStart, syncEnd, clearLine, cursorTo } from "./ansi.js";

export interface FrameStats {
  changedLines: number;
  totalLines: number;
  skipped: boolean;
}

export class DiffRenderer {
  private prevLines: string[] = [];
  private prevWidth = 0;
  lastFrameStats: FrameStats = { changedLines: 0, totalLines: 0, skipped: true };

  /**
   * Render new lines to the terminal, only updating what changed.
   *
   * Strategy:
   * 1. If width changed → full re-render (wrapping affects all lines)
   * 2. Compare each line, collect only changed ones
   * 3. Batch all changes into a single write
   * 4. Clear any remaining old lines if output got shorter
   */
  render(terminal: Terminal, newLines: string[]): void {
    const width = terminal.columns;

    // First render or width changed → full render
    if (this.prevLines.length === 0 || width !== this.prevWidth) {
      this.fullRender(terminal, newLines, width);
      return;
    }

    // Sparse diff: collect only changed lines
    const buf: string[] = [];
    let changedCount = 0;

    for (let i = 0; i < newLines.length; i++) {
      if (this.prevLines[i] !== newLines[i]) {
        buf.push(cursorTo(i + 1, 1), clearLine, newLines[i] ?? "");
        changedCount++;
      }
    }

    // Clear old lines beyond new length
    for (let i = newLines.length; i < this.prevLines.length; i++) {
      buf.push(cursorTo(i + 1, 1), clearLine);
      changedCount++;
    }

    this.lastFrameStats = { changedLines: changedCount, totalLines: newLines.length, skipped: changedCount === 0 };

    if (changedCount === 0) return; // Nothing changed

    // Single batched write wrapped in synchronized output
    terminal.write(syncStart + buf.join("") + syncEnd);
    this.prevLines = newLines.slice();
    this.prevWidth = width;
  }

  /** Full render — write all lines, used for first render and resize. */
  private fullRender(terminal: Terminal, lines: string[], width: number): void {
    const buf: string[] = [syncStart];

    for (let i = 0; i < lines.length; i++) {
      buf.push(cursorTo(i + 1, 1), clearLine, lines[i]!);
    }

    // Clear extra old lines below
    for (let i = lines.length; i < this.prevLines.length; i++) {
      buf.push(cursorTo(i + 1, 1), clearLine);
    }

    buf.push(syncEnd);
    terminal.write(buf.join(""));

    this.prevLines = lines.slice();
    this.prevWidth = width;
    this.lastFrameStats = { changedLines: lines.length, totalLines: lines.length, skipped: false };
  }

  /** Reset internal state (for testing or hard refresh). */
  reset(): void {
    this.prevLines = [];
    this.prevWidth = 0;
  }
}
