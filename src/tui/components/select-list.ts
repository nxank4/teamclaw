/**
 * Selectable list with keyboard navigation and filtering.
 */
import type { Component } from "../core/component.js";
import type { KeyEvent } from "../core/input.js";
import { truncate } from "../utils/truncate.js";
import { defaultTheme } from "../themes/default.js";

export interface SelectItem {
  label: string;
  value: string;
  description?: string;
}

export class SelectListComponent implements Component {
  readonly id: string;
  readonly focusable = true;

  private items: SelectItem[] = [];
  private filteredItems: SelectItem[] = [];
  private selectedIndex = 0;
  private filter = "";
  private maxVisible: number;

  onSelect?: (item: SelectItem) => void;
  onCancel?: () => void;

  constructor(id: string, maxVisible = 10) {
    this.id = id;
    this.maxVisible = maxVisible;
  }

  render(width: number): string[] {
    if (this.filteredItems.length === 0) {
      return [defaultTheme.dim("  No matching items")];
    }

    // Viewport scrolling
    const start = Math.max(0, this.selectedIndex - this.maxVisible + 1);
    const end = Math.min(this.filteredItems.length, start + this.maxVisible);
    const visible = this.filteredItems.slice(start, end);

    const lines: string[] = [];
    for (let i = 0; i < visible.length; i++) {
      const item = visible[i]!;
      const globalIdx = start + i;
      const isSelected = globalIdx === this.selectedIndex;
      const prefix = isSelected ? defaultTheme.primary(defaultTheme.symbols.selected + " ") : "  ";
      let line = prefix + (isSelected ? defaultTheme.bold(item.label) : item.label);
      if (item.description) {
        line += "  " + defaultTheme.dim(item.description);
      }
      lines.push(truncate(line, width));
    }

    // Scroll indicators
    if (start > 0) {
      lines.unshift(defaultTheme.dim("  ↑ " + start + " more"));
    }
    if (end < this.filteredItems.length) {
      lines.push(defaultTheme.dim("  ↓ " + (this.filteredItems.length - end) + " more"));
    }

    return lines;
  }

  onKey(event: KeyEvent): boolean {
    if (event.type === "arrow" && event.direction === "up") {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      return true;
    }
    if (event.type === "arrow" && event.direction === "down") {
      this.selectedIndex = Math.min(this.filteredItems.length - 1, this.selectedIndex + 1);
      return true;
    }
    if (event.type === "enter") {
      const item = this.filteredItems[this.selectedIndex];
      if (item) this.onSelect?.(item);
      return true;
    }
    if (event.type === "escape") {
      this.onCancel?.();
      return true;
    }
    return false;
  }

  setItems(items: SelectItem[]): void {
    this.items = items;
    this.applyFilter();
  }

  setFilter(query: string): void {
    this.filter = query.toLowerCase();
    this.applyFilter();
  }

  private applyFilter(): void {
    if (!this.filter) {
      this.filteredItems = [...this.items];
    } else {
      this.filteredItems = this.items.filter((item) =>
        item.label.toLowerCase().includes(this.filter) ||
        (item.description?.toLowerCase().includes(this.filter) ?? false)
      );
    }
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filteredItems.length - 1));
  }

  getSelectedItem(): SelectItem | undefined {
    return this.filteredItems[this.selectedIndex];
  }
}
