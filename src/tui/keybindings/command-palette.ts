/**
 * Command palette — Ctrl+P searchable command launcher.
 * Aggregates commands, agents, models, sessions, and keybinding actions.
 * Extends the basic QuickSwitcher with fuzzy matching, categories, and frecency.
 */
import type { KeyEvent } from "../core/input.js";
import { visibleWidth } from "../utils/text-width.js";
import { defaultTheme } from "../themes/default.js";

export interface PaletteItem {
  id: string;
  label: string;
  description: string;
  category: string;
  icon: string;
  keybinding?: string;
  action: () => Promise<void>;
  score: number;
}

export interface PaletteSource {
  name: string;
  icon: string;
  getItems(): PaletteItem[];
}

export class CommandPalette {
  private visible = false;
  private query = "";
  private selectedIndex = 0;
  private sources: PaletteSource[] = [];
  private recentActions: string[] = [];
  private cachedItems: PaletteItem[] | null = null;
  private maxVisible = 12;

  addSource(source: PaletteSource): void {
    this.sources.push(source);
    this.cachedItems = null;
  }

  show(initialFilter?: string): void {
    this.visible = true;
    this.query = initialFilter ?? "";
    this.selectedIndex = 0;
    this.cachedItems = null;
  }

  hide(): void {
    this.visible = false;
    this.query = "";
    this.selectedIndex = 0;
    this.cachedItems = null;
  }

  isVisible(): boolean {
    return this.visible;
  }

  handleKey(event: KeyEvent): boolean {
    if (!this.visible) return false;

    if (event.type === "escape") {
      this.hide();
      return true;
    }

    if (event.type === "arrow" && event.direction === "up") {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      return true;
    }
    if (event.type === "arrow" && event.direction === "down") {
      const items = this.getFilteredItems();
      this.selectedIndex = Math.min(items.length - 1, this.selectedIndex + 1);
      return true;
    }

    if (event.type === "enter") {
      void this.executeSelected();
      return true;
    }

    if (event.type === "backspace") {
      if (this.query.length > 0) {
        this.query = this.query.slice(0, -1);
        this.selectedIndex = 0;
        this.cachedItems = null;
      }
      return true;
    }

    if (event.type === "char" && !event.ctrl && !event.alt) {
      this.query += event.char;
      this.selectedIndex = 0;
      this.cachedItems = null;
      return true;
    }

    return true; // consume all keys while visible
  }

  getFilteredItems(): PaletteItem[] {
    const allItems = this.getAllItems();
    if (!this.query) {
      return allItems.slice(0, this.maxVisible);
    }

    const lower = this.query.toLowerCase();
    const scored: PaletteItem[] = [];

    for (const item of allItems) {
      const labelLower = item.label.toLowerCase();
      const descLower = item.description.toLowerCase();

      let score = 0;
      if (labelLower.startsWith(lower)) {
        score = 100;
      } else if (labelLower.includes(lower)) {
        score = 50;
      } else if (descLower.includes(lower)) {
        score = 20;
      } else if (fuzzyMatch(lower, labelLower)) {
        score = 10;
      } else {
        continue;
      }

      // Frecency bonus
      const recentIdx = this.recentActions.indexOf(item.id);
      if (recentIdx !== -1) {
        score += 30 - recentIdx;
      }

      scored.push({ ...item, score });
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, this.maxVisible);
  }

  async executeSelected(): Promise<void> {
    const items = this.getFilteredItems();
    const item = items[this.selectedIndex];
    if (!item) return;

    // Track for frecency
    this.recentActions = [item.id, ...this.recentActions.filter((id) => id !== item.id)].slice(0, 20);
    this.hide();
    await item.action();
  }

  render(width: number): string[] {
    if (!this.visible) return [];

    const lines: string[] = [];
    const innerWidth = Math.min(60, width - 6);
    const pad = " ".repeat(Math.max(0, Math.floor((width - innerWidth - 4) / 2)));

    // Top border
    lines.push(pad + defaultTheme.dim("┌─ Command Palette " + "─".repeat(Math.max(0, innerWidth - 18)) + "┐"));

    // Search input
    const cursor = defaultTheme.primary("▌");
    const queryDisplay = this.query + cursor;
    lines.push(pad + defaultTheme.dim("│") + ` > ${queryDisplay}` + " ".repeat(Math.max(0, innerWidth - visibleWidth(queryDisplay) - 3)) + " " + defaultTheme.dim("│"));
    lines.push(pad + defaultTheme.dim("│") + " ".repeat(innerWidth + 2) + defaultTheme.dim("│"));

    // Items
    const items = this.getFilteredItems();
    let lastCategory = "";

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const isSelected = i === this.selectedIndex;

      // Category header
      if (item.category !== lastCategory) {
        lastCategory = item.category;
        const catLine = `  ${defaultTheme.dim(item.category + ":")}`;
        lines.push(pad + defaultTheme.dim("│") + catLine + " ".repeat(Math.max(0, innerWidth + 2 - visibleWidth(catLine))) + defaultTheme.dim("│"));
      }

      const prefix = isSelected ? defaultTheme.primary("  ▸ ") : "    ";
      const label = isSelected ? defaultTheme.bold(item.label) : item.label;
      const desc = item.description ? "  " + defaultTheme.dim(item.description) : "";
      const kb = item.keybinding ? defaultTheme.dim(item.keybinding) : "";

      const leftContent = prefix + item.icon + " " + label + desc;
      const leftWidth = visibleWidth(leftContent);
      const kbWidth = visibleWidth(kb);
      const gap = Math.max(1, innerWidth + 2 - leftWidth - kbWidth);

      lines.push(pad + defaultTheme.dim("│") + leftContent + " ".repeat(gap) + kb + defaultTheme.dim("│"));
    }

    if (items.length === 0) {
      const noResults = "  No results";
      lines.push(pad + defaultTheme.dim("│") + defaultTheme.dim(noResults) + " ".repeat(Math.max(0, innerWidth + 2 - visibleWidth(noResults))) + defaultTheme.dim("│"));
    }

    // Footer
    lines.push(pad + defaultTheme.dim("│") + " ".repeat(innerWidth + 2) + defaultTheme.dim("│"));
    const hint = "↑↓ navigate  Enter select  Esc close";
    lines.push(pad + defaultTheme.dim("│ ") + defaultTheme.dim(hint) + " ".repeat(Math.max(0, innerWidth + 1 - visibleWidth(hint))) + defaultTheme.dim("│"));
    lines.push(pad + defaultTheme.dim("└" + "─".repeat(innerWidth + 2) + "┘"));

    return lines;
  }

  getQuery(): string { return this.query; }
  getSelectedIndex(): number { return this.selectedIndex; }

  private getAllItems(): PaletteItem[] {
    if (!this.cachedItems) {
      this.cachedItems = this.sources.flatMap((s) => s.getItems());
    }
    return this.cachedItems;
  }
}

/** Simple fuzzy match: all characters of query appear in target in order. */
function fuzzyMatch(query: string, target: string): boolean {
  let qi = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) qi++;
  }
  return qi === query.length;
}
