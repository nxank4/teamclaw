/**
 * Horizontal divider line with optional dynamic label.
 */
import type { Component } from "../core/component.js";
import type { StyleFn } from "../themes/theme.js";
import { ctp } from "../themes/default.js";
import { visibleWidth } from "../utils/text-width.js";

export class DividerComponent implements Component {
  readonly id: string;
  hidden = false;
  private char: string;
  private style: StyleFn;
  private label: string | null = null;

  constructor(id: string, char = "─", style: StyleFn = ctp.surface1) {
    this.id = id;
    this.char = char;
    this.style = style;
  }

  /** Set a dynamic label shown centered in the divider (e.g. "prompt 3/7"). */
  setLabel(label: string | null): void {
    this.label = label;
  }

  render(width: number): string[] {
    if (!this.label) {
      return [this.style(this.char.repeat(width))];
    }
    const labelStr = ` ${this.label} `;
    const labelLen = visibleWidth(labelStr);
    const leftLen = Math.max(2, Math.floor((width - labelLen) / 2));
    const rightLen = Math.max(2, width - leftLen - labelLen);
    return [
      this.style(this.char.repeat(leftLen)) +
      ctp.overlay1(labelStr) +
      this.style(this.char.repeat(rightLen)),
    ];
  }
}
