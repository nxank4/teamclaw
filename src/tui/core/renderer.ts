/**
 * Differential renderer — compares previous vs current frame line-by-line,
 * only rewriting changed lines. Uses absolute cursor positioning and
 * CSI 2026 synchronized output to prevent flicker.
 *
 * Absolute positioning (\x1b[row;colH) avoids scrollback issues that
 * plague relative cursorUp() when output exceeds the terminal viewport.
 */
import type { Terminal } from "./terminal.js";
import { syncStart, syncEnd, clearLine, cursorTo } from "./ansi.js";

export class DiffRenderer {
  private prevLines: string[] = [];
  private prevWidth = 0;

  /**
   * Render new lines to the terminal, only updating what changed.
   *
   * Strategy:
   * 1. If width changed → full re-render (wrapping affects all lines)
   * 2. Find first line that differs from previous frame
   * 3. Rewrite from that line through the end using absolute positioning
   * 4. Clear any remaining old lines if output got shorter
   */
  render(terminal: Terminal, newLines: string[]): void {
    const width = terminal.columns;

    // First render or width changed → full render
    if (this.prevLines.length === 0 || width !== this.prevWidth) {
      this.fullRender(terminal, newLines, width);
      return;
    }

    // Find first changed line
    const maxLen = Math.max(this.prevLines.length, newLines.length);
    let firstChanged = -1;
    for (let i = 0; i < maxLen; i++) {
      if (this.prevLines[i] !== newLines[i]) {
        firstChanged = i;
        break;
      }
    }

    if (firstChanged === -1) {
      // Nothing changed — skip render entirely
      return;
    }

    // Wrap in synchronized output
    terminal.write(syncStart);

    // Rewrite from firstChanged through end of newLines (absolute positioning)
    for (let i = firstChanged; i < newLines.length; i++) {
      terminal.write(cursorTo(i + 1, 1) + clearLine + (newLines[i] ?? ""));
    }

    // If new output is shorter, clear remaining old lines
    for (let i = newLines.length; i < this.prevLines.length; i++) {
      terminal.write(cursorTo(i + 1, 1) + clearLine);
    }

    terminal.write(syncEnd);
    this.prevLines = [...newLines];
    this.prevWidth = width;
  }

  /** Full render — write all lines, used for first render and resize. */
  private fullRender(terminal: Terminal, lines: string[], width: number): void {
    terminal.write(syncStart);

    // Write all lines using absolute positioning
    for (let i = 0; i < lines.length; i++) {
      terminal.write(cursorTo(i + 1, 1) + clearLine + lines[i]);
    }

    // Clear any extra old lines below
    for (let i = lines.length; i < this.prevLines.length; i++) {
      terminal.write(cursorTo(i + 1, 1) + clearLine);
    }

    terminal.write(syncEnd);
    this.prevLines = [...lines];
    this.prevWidth = width;
  }

  /** Reset internal state (for testing or hard refresh). */
  reset(): void {
    this.prevLines = [];
    this.prevWidth = 0;
  }
}
