/**
 * Input expander — handles multi-line input expansion and height calculation.
 * Input starts as 1 line, expands on Shift+Enter, caps at maxHeight or 1/3 terminal.
 */
import { visibleWidth } from "../utils/text-width.js";

export class InputExpander {
  private maxHeight: number;
  private terminalHeight: number;

  constructor(maxHeight = 10, terminalHeight = 24) {
    this.maxHeight = maxHeight;
    this.terminalHeight = terminalHeight;
  }

  /** Calculate required height for input text. */
  calculateHeight(text: string, terminalWidth: number): number {
    if (!text) return 1;

    const lines = text.split("\n");
    let totalLines = 0;

    for (const line of lines) {
      const lineWidth = visibleWidth(line);
      // Account for border padding (4 chars: │ content │)
      const availableWidth = Math.max(1, terminalWidth - 4);
      if (lineWidth <= availableWidth) {
        totalLines += 1;
      } else {
        totalLines += Math.ceil(lineWidth / availableWidth);
      }
    }

    return Math.min(totalLines, this.getEffectiveMaxHeight());
  }

  /** Should the input area expand beyond 1 line? */
  shouldExpand(text: string, terminalWidth: number): boolean {
    return this.calculateHeight(text, terminalWidth) > 1;
  }

  /** Get visible line range when input is scrollable. */
  getVisibleRange(
    text: string,
    cursorLine: number,
    availableHeight: number,
  ): { startLine: number; endLine: number } {
    const lines = text.split("\n");
    const totalLines = lines.length;
    const height = Math.min(availableHeight, this.getEffectiveMaxHeight());

    if (totalLines <= height) {
      return { startLine: 0, endLine: totalLines - 1 };
    }

    // Keep cursor visible
    let startLine = Math.max(0, cursorLine - Math.floor(height / 2));
    let endLine = startLine + height - 1;

    if (endLine >= totalLines) {
      endLine = totalLines - 1;
      startLine = Math.max(0, endLine - height + 1);
    }

    return { startLine, endLine };
  }

  onResize(terminalHeight: number): void {
    this.terminalHeight = terminalHeight;
  }

  getEffectiveMaxHeight(): number {
    return Math.min(this.maxHeight, Math.floor(this.terminalHeight / 3));
  }
}
