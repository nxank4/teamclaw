/**
 * Interactive model picker — shows ONLY dynamically discovered models.
 * Groups by provider, marks current model, shows status indicators.
 */
import type { KeyEvent } from "../../tui/core/input.js";
import type { TUI } from "../../tui/core/tui.js";
import { InteractiveView } from "./base-view.js";
import { discoverModels, getCurrentModel, type DiscoveredModel, type ProviderStatus } from "../../providers/model-discovery.js";
import { ctp } from "../../tui/themes/default.js";

interface ModelItem {
  model: DiscoveredModel;
  selectable: boolean;
}

export class ModelView extends InteractiveView {
  private currentModel: string;
  private onSelect: (model: string) => void;
  private items: ModelItem[] = [];
  private providerStatuses: ProviderStatus[] = [];
  private loading = true;

  constructor(tui: TUI, currentModel: string, onSelect: (model: string) => void, onClose: () => void) {
    super(tui, onClose);
    this.currentModel = currentModel || getCurrentModel();
    this.onSelect = onSelect;
  }

  override activate(): void {
    this.filterEnabled = true;
    this.filterText = "";
    super.activate();
    void this.loadModels();
  }

  private async loadModels(): Promise<void> {
    this.loading = true;
    this.render();

    const result = await discoverModels();
    this.providerStatuses = result.providers;
    this.items = result.models
      .filter((m) => m.status === "available" || m.status === "configured")
      .map((m) => ({ model: m, selectable: true }));

    // Pre-select current model and adjust scroll
    const idx = this.items.findIndex((item) => item.model.model === this.currentModel);
    if (idx >= 0) {
      this.selectedIndex = idx;
      this.adjustScroll();
    }

    this.loading = false;
    this.render();
  }

  private getFilteredItems(): ModelItem[] {
    return this.items.filter((item) => this.matchesFilter(item.model.displayName || item.model.model));
  }

  protected getItemCount(): number { return this.getFilteredItems().length; }

  private selectAndClose(): void {
    const filtered = this.getFilteredItems();
    const item = filtered[this.selectedIndex];
    if (item?.selectable) {
      this.onSelect(item.model.model);
      this.deactivate();
    }
  }

  protected handleCustomKey(event: KeyEvent): boolean {
    if (event.type === "enter") {
      this.selectAndClose();
      return true;
    }
    return true;
  }

  protected override getPanelTitle(): string { return "\u26a1 Models"; }
  protected override getPanelFooter(): string { return "\u2191\u2193 navigate \u00b7 Enter select \u00b7 Type to filter \u00b7 Esc close"; }

  protected renderLines(): string[] {
    const t = this.theme;
    const lines: string[] = [];

    if (this.loading) {
      lines.push(`    ${ctp.teal("\u25d0")} Discovering available models...`);
      lines.push("");
      return lines;
    }

    if (this.items.length === 0) {
      lines.push(`    ${ctp.overlay1("No models available.")}`);
      lines.push(`    ${ctp.overlay0("Run /settings to configure a provider.")}`);
      lines.push("");
      return lines;
    }

    const filterLine = this.renderFilterLine();
    if (filterLine) {
      lines.push(`    ${filterLine}`);
      lines.push("");
    }

    const filtered = this.getFilteredItems();

    if (filtered.length === 0 && this.filterText) {
      lines.push(`    ${ctp.overlay1(`No models match "${this.filterText}"`)}`);
      lines.push("");
      return lines;
    }

    // Group available models by provider (with scroll)
    const { start, end, aboveCount, belowCount } = this.getVisibleRange();
    const visible = filtered.slice(start, end);
    let lastProvider = "";
    const itemLines: string[] = [];

    for (let vi = 0; vi < visible.length; vi++) {
      const globalIdx = start + vi;
      const item = visible[vi]!;
      const m = item.model;
      const isSelected = globalIdx === this.selectedIndex;
      const isCurrent = m.model === this.currentModel;

      if (m.provider !== lastProvider) {
        if (lastProvider) itemLines.push("");
        const status = this.providerStatuses.find((p) => p.id === m.provider);
        const dot = status?.status === "connected" ? ctp.green("\u25cf") : ctp.yellow("\u25d0");
        itemLines.push(`    ${dot} ${t.dim(m.provider)}`);
        lastProvider = m.provider;
      }

      const cursor = isSelected ? ctp.mauve("\u25b8 ") : "  ";
      const current = isCurrent ? ctp.green("  \u2190 current") : "";
      const ctxInfo = m.contextWindow ? t.dim(` ${Math.round(m.contextWindow / 1000)}k ctx`) : "";

      if (isSelected) {
        itemLines.push(`      ${cursor}${t.bold(m.displayName)}${ctxInfo}${current}`);
      } else {
        itemLines.push(`      ${cursor}${m.displayName}${ctxInfo}${current}`);
      }
    }

    const withIndicators = this.addScrollIndicators(itemLines, aboveCount, belowCount);
    lines.push(...withIndicators);

    // Show unconfigured providers
    const unconfigured = this.providerStatuses.filter((p) => p.status === "not_configured" || (p.modelCount === 0 && p.status !== "connected"));
    if (unconfigured.length > 0) {
      lines.push("");
      lines.push(`    ${ctp.overlay0("Not configured:")}`);
      for (const p of unconfigured) {
        lines.push(`      ${ctp.surface2("\u25cb")} ${ctp.overlay0(p.name)}  ${ctp.overlay0("/settings to add")}`);
      }
    }

    lines.push("");
    lines.push(ctp.overlay0("    /model <name> for any model \u00b7 /settings to add providers"));
    lines.push("");
    return lines;
  }
}
