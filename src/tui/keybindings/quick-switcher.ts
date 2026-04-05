/**
 * Ctrl+P fuzzy finder — search sessions, files, agents, commands.
 */

export interface QuickSwitchItem {
  label: string;
  description?: string;
  source: string;
  action: () => Promise<void>;
  score?: number;
}

export interface QuickSwitchSource {
  name: string;
  icon: string;
  getItems(): QuickSwitchItem[];
}

export class QuickSwitcher {
  private sources: QuickSwitchSource[] = [];
  private active = false;

  constructor(sources: QuickSwitchSource[]) {
    this.sources = sources;
  }

  activate(): void { this.active = true; }
  dismiss(): void { this.active = false; }
  isActive(): boolean { return this.active; }

  filter(query: string): QuickSwitchItem[] {
    if (!query) {
      return this.sources.flatMap((s) => s.getItems().slice(0, 5));
    }

    const lower = query.toLowerCase();
    const results: QuickSwitchItem[] = [];

    for (const source of this.sources) {
      for (const item of source.getItems()) {
        const labelLower = item.label.toLowerCase();
        if (labelLower.includes(lower)) {
          const pos = labelLower.indexOf(lower);
          item.score = pos === 0 ? 100 : 50 - pos;
          results.push(item);
        }
      }
    }

    return results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 15);
  }

  async execute(item: QuickSwitchItem): Promise<void> {
    this.dismiss();
    await item.action();
  }
}
