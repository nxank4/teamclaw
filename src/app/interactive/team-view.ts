/**
 * Interactive team configuration view.
 * Toggle between autonomous/template/manual modes,
 * browse and select templates, manage agents.
 */
import type { KeyEvent } from "../../tui/core/input.js";
import type { TUI } from "../../tui/core/tui.js";
import { InteractiveView } from "./base-view.js";
import { ScrollableFilterList } from "../../tui/components/scrollable-filter-list.js";
import { handleFilterInput } from "../../tui/components/input-handler.js";
import { ICONS } from "../../tui/constants/icons.js";
import type { OpenPawlTemplate, TemplateAgent } from "../../templates/types.js";
import { listTemplates } from "../../templates/template-store.js";
import { readGlobalConfigWithDefaults, writeGlobalConfig } from "../../core/global-config.js";
import { getAllAgentConfigs, isBuiltInAgent } from "../../router/agent-config.js";

type TeamMode = "autonomous" | "template" | "manual";
const MODES: TeamMode[] = ["autonomous", "template", "manual"];

interface TemplateItem {
  template: OpenPawlTemplate;
}

// Default agents when in manual mode with no prior config
const DEFAULT_MANUAL_AGENTS: TemplateAgent[] = [
  { role: "planner", task: "Task breakdown and planning" },
  { role: "coder", task: "Implementation" },
  { role: "reviewer", task: "Code review" },
  { role: "tester", task: "Testing" },
];

type Section = "mode" | "templates" | "agents";

export class TeamView extends InteractiveView {
  private mode: TeamMode = "autonomous";
  private chatCollaboration = false;
  private templateId: string | null = null;
  private templates: OpenPawlTemplate[] = [];
  private selectedTemplate: OpenPawlTemplate | null = null;
  private manualAgents: TemplateAgent[] = [];

  private section: Section = "mode";
  private modeIndex = 0;
  private templateList: ScrollableFilterList<TemplateItem>;
  private templateSelectedIndex = 0;
  private templateScrollOffset = 0;
  private agentSelectedIndex = 0;

  private onUpdate: ((mode: TeamMode, templateId: string | null) => void) | null;

  constructor(
    tui: TUI,
    onUpdate: ((mode: TeamMode, templateId: string | null) => void) | null,
    onClose: () => void,
  ) {
    super(tui, onClose);
    this.onUpdate = onUpdate;
    this.templateList = new ScrollableFilterList<TemplateItem>({
      renderItem: (item, _index, selected) => this.renderTemplateItem(item, selected),
      filterFn: (item, query) => {
        const q = query.toLowerCase();
        return item.template.name.toLowerCase().includes(q)
          || item.template.id.toLowerCase().includes(q)
          || item.template.tags.some((tag) => tag.toLowerCase().includes(q));
      },
      emptyMessage: "No templates available.",
      filterPlaceholder: "Type to search templates...",
      filterThreshold: 8,
    });
  }

  override activate(): void {
    this.filterEnabled = true;
    this.filterText = "";
    this.loadConfig();
    super.activate();
    void this.loadTemplates();
  }

  private loadConfig(): void {
    const config = readGlobalConfigWithDefaults();
    const team = config.team;
    if (team) {
      this.mode = team.mode ?? "autonomous";
      this.chatCollaboration = team.chatCollaboration ?? false;
      this.templateId = team.templateId ?? null;
      if (team.customAgents && team.customAgents.length > 0) {
        this.manualAgents = team.customAgents.map((a) => ({
          role: a.role,
          task: a.task,
          model: a.modelOverride,
        }));
      } else {
        this.manualAgents = [...DEFAULT_MANUAL_AGENTS];
      }
    } else {
      this.mode = "autonomous";
      this.templateId = null;
      this.manualAgents = [...DEFAULT_MANUAL_AGENTS];
    }
    this.modeIndex = MODES.indexOf(this.mode);
    if (this.modeIndex < 0) this.modeIndex = 0;
  }

  private async loadTemplates(): Promise<void> {
    this.templates = await listTemplates();
    const items = this.templates.map((t) => ({ template: t }));
    this.templateList.setItems(items);

    // Pre-select current template
    if (this.templateId) {
      const idx = this.templates.findIndex((t) => t.id === this.templateId);
      if (idx >= 0) {
        this.templateSelectedIndex = idx;
        this.selectedTemplate = this.templates[idx]!;
      }
    }
    this.render();
  }

  private saveConfig(): void {
    const config = readGlobalConfigWithDefaults();
    config.team = {
      mode: this.mode,
      chatCollaboration: this.chatCollaboration,
      ...(this.templateId ? { templateId: this.templateId } : {}),
      ...(this.mode === "manual" && this.manualAgents.length > 0
        ? {
            customAgents: this.manualAgents.map((a) => ({
              role: a.role,
              ...(a.task ? { task: a.task } : {}),
              ...(a.model ? { modelOverride: a.model } : {}),
            })),
          }
        : {}),
    };
    writeGlobalConfig(config);
    this.onUpdate?.(this.mode, this.templateId);
  }

  // Item count depends on section
  protected getItemCount(): number {
    if (this.section === "mode") return MODES.length;
    if (this.section === "templates") return this.templateList.getFilteredCount(this.filterText);
    // agents section: agents + "add" action
    return this.manualAgents.length + 1;
  }

  protected handleCustomKey(event: KeyEvent): boolean {
    // Tab to switch sections
    if (event.type === "char" && event.char === "\t") {
      this.nextSection();
      return true;
    }

    if (event.type === "enter") {
      this.handleEnter();
      return true;
    }

    // Left/Right for mode toggle
    if (this.section === "mode" && event.type === "arrow") {
      if (event.direction === "left") {
        this.modeIndex = Math.max(0, this.modeIndex - 1);
        this.setMode(MODES[this.modeIndex]!);
        this.render();
        return true;
      }
      if (event.direction === "right") {
        this.modeIndex = Math.min(MODES.length - 1, this.modeIndex + 1);
        this.setMode(MODES[this.modeIndex]!);
        this.render();
        return true;
      }
    }

    // Delete to remove agent in manual mode
    if (this.section === "agents" && (event.type === "char" && (event.char === "d" || event.char === "x"))) {
      if (this.agentSelectedIndex < this.manualAgents.length && this.manualAgents.length > 1) {
        this.manualAgents.splice(this.agentSelectedIndex, 1);
        if (this.agentSelectedIndex >= this.manualAgents.length) {
          this.agentSelectedIndex = this.manualAgents.length;
        }
        this.saveConfig();
        this.render();
        return true;
      }
    }

    return true;
  }

  private nextSection(): void {
    const sections = this.getAvailableSections();
    const idx = sections.indexOf(this.section);
    const next = sections[(idx + 1) % sections.length]!;
    this.section = next;
    this.selectedIndex = this.getSectionSelectedIndex();
    this.scrollOffset = 0;
    this.render();
  }

  private getAvailableSections(): Section[] {
    if (this.mode === "template") return ["mode", "templates"];
    if (this.mode === "manual") return ["mode", "agents"];
    return ["mode"];
  }

  private getSectionSelectedIndex(): number {
    if (this.section === "mode") return this.modeIndex;
    if (this.section === "templates") return this.templateSelectedIndex;
    return this.agentSelectedIndex;
  }

  private setMode(mode: TeamMode): void {
    this.mode = mode;
    this.modeIndex = MODES.indexOf(mode);
    this.saveConfig();
  }

  private handleEnter(): void {
    if (this.section === "mode") {
      this.setMode(MODES[this.selectedIndex]!);
      // Auto-advance to relevant section
      if (this.mode === "template") {
        this.section = "templates";
        this.selectedIndex = this.templateSelectedIndex;
      } else if (this.mode === "manual") {
        this.section = "agents";
        this.selectedIndex = this.agentSelectedIndex;
      }
      this.render();
      return;
    }

    if (this.section === "templates") {
      const filtered = this.templateList.getFilteredItems(this.filterText);
      const item = filtered[this.selectedIndex];
      if (item) {
        this.templateId = item.template.id;
        this.selectedTemplate = item.template;
        this.templateSelectedIndex = this.selectedIndex;
        this.saveConfig();
        this.render();
      }
      return;
    }

    if (this.section === "agents") {
      // "Add agent" action at the bottom
      if (this.selectedIndex === this.manualAgents.length) {
        this.addDefaultAgent();
      }
      return;
    }
  }

  private addDefaultAgent(): void {
    const builtInRoles = ["planner", "coder", "reviewer", "tester", "debugger", "researcher"];
    // Include custom agents from config
    const customConfigs = getAllAgentConfigs();
    const customIds = Object.entries(customConfigs)
      .filter(([id, cfg]) => !isBuiltInAgent(id) && cfg.custom)
      .map(([id]) => id);
    const allRoles = [...builtInRoles, ...customIds];
    const usedRoles = new Set(this.manualAgents.map((a) => a.role));
    const available = allRoles.find((r) => !usedRoles.has(r)) ?? "coder";
    const customCfg = customConfigs[available];
    this.manualAgents.push({ role: available, task: customCfg?.description ?? "" });
    this.agentSelectedIndex = this.manualAgents.length; // select "add" again
    this.saveConfig();
    this.render();
  }

  // Override navigation to route to section-specific indices
  override handleKey(event: KeyEvent): boolean {
    if (!this.active) return false;

    // Let base handle Esc, Ctrl+C, filter
    if (event.type === "escape" || (event.type === "char" && event.char === "c" && event.ctrl)) {
      return super.handleKey(event);
    }

    // Section-specific navigation for up/down
    if (event.type === "arrow" && (event.direction === "up" || event.direction === "down")) {
      const count = this.getItemCount();
      if (count === 0) return true;
      const current = this.getSectionSelectedIndex();
      let next = current;
      if (event.direction === "up") next = current > 0 ? current - 1 : count - 1;
      if (event.direction === "down") next = current < count - 1 ? current + 1 : 0;

      this.setSectionSelectedIndex(next);
      this.selectedIndex = next;
      this.adjustScroll();
      this.render();
      return true;
    }

    // Filter input for templates section
    if (this.section === "templates" && this.filterEnabled) {
      const filterResult = handleFilterInput(event, this.filterText);
      if (filterResult.handled) {
        this.filterText = filterResult.text;
        this.selectedIndex = 0;
        this.templateSelectedIndex = 0;
        this.templateScrollOffset = 0;
        this.render();
        return true;
      }
    }

    return this.handleCustomKey(event);
  }

  private setSectionSelectedIndex(index: number): void {
    if (this.section === "mode") this.modeIndex = index;
    else if (this.section === "templates") this.templateSelectedIndex = index;
    else this.agentSelectedIndex = index;
  }

  protected override getPanelTitle(): string { return `${ICONS.gear} Team Configuration`; }
  protected override getPanelFooter(): string {
    const parts = [`${ICONS.arrowUp}${ICONS.arrowDown} navigate`, "Enter select"];
    if (this.getAvailableSections().length > 1) parts.push("Tab section");
    if (this.section === "mode") parts.push(`${ICONS.arrowLeft}${ICONS.arrow} toggle`);
    if (this.section === "agents") parts.push("d remove");
    parts.push("Esc close");
    return parts.join(" \u00b7 ");
  }

  private renderTemplateItem(item: TemplateItem, selected: boolean): string[] {
    const t = this.theme;
    const tpl = item.template;
    const isCurrent = tpl.id === this.templateId;
    const cursor = selected ? t.primary(`${ICONS.cursor} `) : "  ";
    const currentTag = isCurrent ? t.success("  \u2190 active") : "";
    const name = selected ? t.bold(tpl.name) : tpl.name;
    const pipeline = tpl.pipeline
      ? t.dim(` ${tpl.pipeline.join(" \u2192 ")}`)
      : t.dim(` ${tpl.agents.map((a) => a.role).join(", ")}`);
    const cost = tpl.estimatedCostPerRun
      ? t.dim(` ~$${tpl.estimatedCostPerRun.toFixed(2)}/run`)
      : "";

    return [`    ${cursor}${name}${currentTag}`, `      ${pipeline}${cost}`];
  }

  protected renderLines(): string[] {
    const t = this.theme;
    const lines: string[] = [];

    // Preview mode: show section matching cursor when browsing modes
    const previewMode = this.section === "mode" ? MODES[this.modeIndex]! : this.mode;

    // ── Mode selector ──
    const modeActive = this.section === "mode";
    lines.push(`  ${modeActive ? t.bold("Mode") : t.dim("Mode")}`);
    lines.push("");

    for (let i = 0; i < MODES.length; i++) {
      const mode = MODES[i]!;
      const isSelected = modeActive && this.modeIndex === i;
      const isCurrent = mode === this.mode;
      const icon = isCurrent ? ICONS.diamond : "\u25cb";
      const cursor = isSelected ? t.primary(`${ICONS.cursor} `) : "  ";
      const label = isSelected ? t.bold(mode) : isCurrent ? mode : t.dim(mode);
      lines.push(`    ${cursor}${icon} ${label}`);
    }
    lines.push("");

    // ── Mode description ──
    if (previewMode === "autonomous") {
      lines.push(`  ${t.dim("Team will be composed automatically based on your goal.")}`);
      lines.push("");
    }

    // ── Chat collaboration toggle ──
    const collabIcon = this.chatCollaboration ? ICONS.success : "\u25cb";
    const collabLabel = this.chatCollaboration ? "enabled" : "disabled";
    lines.push(`  ${t.dim("Chat collaboration:")} ${collabIcon} ${collabLabel}`);
    lines.push(`  ${t.dim("When enabled, auto-detect multi-step prompts in solo mode.")}`);
    lines.push("");

    // ── Templates section (template mode) ──
    if (previewMode === "template") {
      const tplActive = this.section === "templates";
      lines.push(`  ${tplActive ? t.bold("\u2500\u2500 Templates") : t.dim("\u2500\u2500 Templates")} ${t.dim(`\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`)}`);
      lines.push("");

      if (this.templates.length === 0) {
        lines.push(`    ${t.dim("Loading templates...")}`);
      } else {
        // Mode section overhead: ~6 lines; templates header: 2 lines; preview: ~7 lines; padding: 2
        // Ensure at least 3 items (each takes 2 lines) are visible
        const templateMaxVisible = Math.max(3, this.maxVisible - 6);
        const listLines = this.templateList.renderLines({
          filterText: tplActive ? this.filterText : "",
          selectedIndex: tplActive ? this.templateSelectedIndex : -1,
          scrollOffset: this.templateScrollOffset,
          maxVisible: templateMaxVisible,
        });
        lines.push(...listLines);
      }

      // Template preview — only show if there's enough space
      if (this.selectedTemplate && this.maxVisible > 10) {
        lines.push("");
        lines.push(`  ${t.bold("\u2500\u2500 Preview")} ${t.dim(`\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`)}`);
        lines.push(`    ${t.dim(this.selectedTemplate.description)}`);
        lines.push("");
        for (const agent of this.selectedTemplate.agents) {
          const task = agent.task ? t.dim(` \u2014 ${agent.task}`) : "";
          lines.push(`    ${ICONS.bullet} ${agent.role}${task}`);
        }
      }
      lines.push("");
    }

    // ── Agents section (manual mode) ──
    if (previewMode === "manual") {
      const agentActive = this.section === "agents";
      lines.push(`  ${agentActive ? t.bold("\u2500\u2500 Current Team") : t.dim("\u2500\u2500 Current Team")} ${t.dim(`\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`)}`);
      lines.push("");

      for (let i = 0; i < this.manualAgents.length; i++) {
        const agent = this.manualAgents[i]!;
        const isSelected = agentActive && this.agentSelectedIndex === i;
        const cursor = isSelected ? t.primary(`${ICONS.cursor} `) : "  ";
        const label = isSelected ? t.bold(agent.role) : agent.role;
        const task = agent.task ? t.dim(` (${agent.task})`) : "";
        lines.push(`    ${cursor}${label}${task}`);
      }

      // "Add agent" action
      const addSelected = agentActive && this.agentSelectedIndex === this.manualAgents.length;
      const addCursor = addSelected ? t.primary(`${ICONS.cursor} `) : "  ";
      const addLabel = addSelected ? t.bold("+ Add agent...") : t.dim("+ Add agent...");
      lines.push(`    ${addCursor}${addLabel}`);
      lines.push("");
    }

    return lines;
  }
}
