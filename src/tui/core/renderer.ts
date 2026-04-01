/**
 * Differential renderer — compares previous vs current frame line-by-line,
 * only rewriting changed lines. Uses CSI 2026 synchronized output to prevent flicker.
 */
import type { Terminal } from "./terminal.js";
import { syncStart, syncEnd, clearLine, cursorUp } from "./ansi.js";

export class DiffRenderer {
  private prevLines: string[] = [];
  private prevWidth = 0;

  /**
   * Render new lines to the terminal, only updating what changed.
   *
   * Strategy:
   * 1. If width changed → full re-render (wrapping affects all lines)
   * 2. Find first line that differs from previous frame
   * 3. Move cursor to that line
   * 4. Rewrite from that line through the end
   * 5. Clear any remaining old lines if output got shorter
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

    // Move cursor to the first changed line.
    // Cursor is currently at the end of the previous frame (after last line).
    const linesFromEnd = this.prevLines.length - firstChanged;
    if (linesFromEnd > 0) {
      terminal.write(cursorUp(linesFromEnd));
    }
    terminal.write("\r"); // move to column 0

    // Rewrite from firstChanged through end of newLines
    for (let i = firstChanged; i < newLines.length; i++) {
      terminal.write(clearLine + (newLines[i] ?? "") + "\n");
    }

    // If new output is shorter, clear remaining old lines
    if (newLines.length < this.prevLines.length) {
      const extraLines = this.prevLines.length - newLines.length;
      for (let i = 0; i < extraLines; i++) {
        terminal.write(clearLine + "\n");
      }
      // Move cursor back up to end of actual content
      terminal.write(cursorUp(extraLines));
    }

    terminal.write(syncEnd);
    this.prevLines = [...newLines];
    this.prevWidth = width;
  }

  /** Full render — write all lines, used for first render and resize. */
  private fullRender(terminal: Terminal, lines: string[], width: number): void {
    terminal.write(syncStart);

    // If we had previous content, move to start and clear
    if (this.prevLines.length > 0) {
      terminal.write(cursorUp(this.prevLines.length));
      terminal.write("\r");
    }

    for (const line of lines) {
      terminal.write(clearLine + line + "\n");
    }

    // Clear any extra old lines
    if (lines.length < this.prevLines.length) {
      const extra = this.prevLines.length - lines.length;
      for (let i = 0; i < extra; i++) {
        terminal.write(clearLine + "\n");
      }
      terminal.write(cursorUp(extra));
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
