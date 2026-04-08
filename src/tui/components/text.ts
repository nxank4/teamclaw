/**
 * Static text component — renders text lines with optional ANSI styling.
 */
import type { Component } from "../core/component.js";
import { wrapText } from "../utils/wrap.js";

export class TextComponent implements Component {
  readonly id: string;
  private content: string;

  constructor(id: string, content: string) {
    this.id = id;
    this.content = content;
  }

  render(width: number): string[] {
    if (!this.content) return [];
    return wrapText(this.content, width);
  }

  setContent(content: string): void {
    this.content = content;
  }

  getContent(): string {
    return this.content;
  }
}
