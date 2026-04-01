/**
 * Status bar — fixed bar displaying key-value information.
 * Typically used at the top or bottom of the TUI.
 */
import type { Component } from "../core/component.js";
import { visibleWidth } from "../utils/text-width.js";
import { truncate } from "../utils/truncate.js";

export class StatusBarComponent implements Component {
  readonly id: string;
  private leftItems: string[] = [];
  private rightItems: string[] = [];
  private style: (s: string) => string;

  constructor(id: string, style?: (s: string) => string) {
    this.id = id;
    this.style = style ?? ((s) => `\x1b[7m${s}\x1b[27m`); // inverse by default
  }

  render(width: number): string[] {
    const left = this.leftItems.join("  ");
    const right = this.rightItems.join("  ");

    const leftWidth = visibleWidth(left);
    const rightWidth = visibleWidth(right);
    const gap = Math.max(1, width - leftWidth - rightWidth);

    let bar: string;
    if (leftWidth + rightWidth + 1 > width) {
      // Truncate left to make room for right
      bar = truncate(left, width - rightWidth - 1) + " " + right;
    } else {
      bar = left + " ".repeat(gap) + right;
    }

    // Pad to full width
    const barWidth = visibleWidth(bar);
    if (barWidth < width) {
      bar += " ".repeat(width - barWidth);
    }

    return [this.style(bar)];
  }

  setLeft(...items: string[]): void {
    this.leftItems = items;
  }

  setRight(...items: string[]): void {
    this.rightItems = items;
  }
}
