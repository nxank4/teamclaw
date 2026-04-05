/**
 * Column renderer — renders split layout with copy-safe separation.
 * Inserts zero-width spaces at column boundaries for better native copy behavior.
 */
import { visibleWidth } from "../utils/text-width.js";
import { truncate } from "../utils/truncate.js";

const ZERO_WIDTH_SPACE = "\u200B";

export class ColumnRenderer {
  private leftContent: string[] = [];
  private rightContent: string[] = [];

  /**
   * Render two columns side by side.
   * Returns array of combined lines for terminal output.
   */
  renderSplit(
    leftLines: string[],
    rightLines: string[],
    leftWidth: number,
    rightWidth: number,
    options?: { separator?: string; padChar?: string },
  ): string[] {
    const sep = options?.separator ?? " │ ";
    const pad = options?.padChar ?? " ";
    const totalRows = Math.max(leftLines.length, rightLines.length);
    const result: string[] = [];

    this.leftContent = leftLines;
    this.rightContent = rightLines;

    for (let i = 0; i < totalRows; i++) {
      const left = i < leftLines.length ? leftLines[i]! : "";
      const right = i < rightLines.length ? rightLines[i]! : "";

      // Pad or truncate left column to exact width
      const leftVis = visibleWidth(left);
      let leftPadded: string;
      if (leftVis < leftWidth) {
        leftPadded = left + pad.repeat(leftWidth - leftVis);
      } else if (leftVis > leftWidth) {
        leftPadded = truncate(left, leftWidth, "");
      } else {
        leftPadded = left;
      }

      // Pad or truncate right column
      const rightVis = visibleWidth(right);
      let rightPadded: string;
      if (rightVis < rightWidth) {
        rightPadded = right + pad.repeat(rightWidth - rightVis);
      } else if (rightVis > rightWidth) {
        rightPadded = truncate(right, rightWidth, "");
      } else {
        rightPadded = right;
      }

      // Insert zero-width space at column boundary for copy separation
      result.push(leftPadded + ZERO_WIDTH_SPACE + sep + rightPadded);
    }

    return result;
  }

  /**
   * Get content for only the specified column (for programmatic copy).
   * Returns original text without padding or separator.
   */
  getColumnContent(
    column: "left" | "right",
    startLine: number,
    endLine: number,
  ): string {
    const source = column === "left" ? this.leftContent : this.rightContent;
    const start = Math.max(0, startLine);
    const end = Math.min(source.length - 1, endLine);
    return source.slice(start, end + 1).join("\n");
  }
}
