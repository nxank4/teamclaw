/**
 * Modal overlay — renders its child component centered over the current screen.
 */
import type { Component } from "../core/component.js";
import type { KeyEvent } from "../core/input.js";
import { visibleWidth } from "../utils/text-width.js";

export class OverlayComponent implements Component {
  readonly id: string;
  private child: Component;
  private width: number;

  constructor(id: string, child: Component, width = 60) {
    this.id = id;
    this.child = child;
    this.width = width;
  }

  render(termWidth: number): string[] {
    const contentWidth = Math.min(this.width, termWidth - 4);
    const childLines = this.child.render(contentWidth);
    const padding = Math.max(0, Math.floor((termWidth - contentWidth - 2) / 2));
    const pad = " ".repeat(padding);

    const lines: string[] = [];
    lines.push(pad + "┌" + "─".repeat(contentWidth) + "┐");
    for (const line of childLines) {
      const lineWidth = visibleWidth(line);
      const rightPad = Math.max(0, contentWidth - lineWidth);
      lines.push(pad + "│" + line + " ".repeat(rightPad) + "│");
    }
    lines.push(pad + "└" + "─".repeat(contentWidth) + "┘");

    return lines;
  }

  onKey(event: KeyEvent): boolean {
    return this.child.onKey?.(event) ?? false;
  }

  getChild(): Component {
    return this.child;
  }
}
