/**
 * Interactive agent management view — list, view, edit, create, delete agents.
 */
import type { KeyEvent } from "../../tui/core/input.js";
import type { TUI } from "../../tui/core/tui.js";
import type { AgentDefinition } from "../../router/router-types.js";
import { InteractiveView } from "./base-view.js";
import { ScrollableFilterList } from "../../tui/components/scrollable-filter-list.js";
import { handleTextInput } from "../../tui/components/input-handler.js";
import { ICONS } from "../../tui/constants/icons.js";
import {
  getAgentConfig,
  setAgentConfig,
  deleteAgentConfig,
  getAllAgentConfigs,
  isBuiltInAgent,
} from "../../router/agent-config.js";

type ViewState = "list" | "detail" | "edit" | "delete";

interface AgentListItem {
  id: string;
  name: string;
  description: string;
  isBuiltIn: boolean;
  isCustom: boolean;
  tools: string[];
  systemPrompt: string;
}

interface EditField {
  key: string;
  label: string;
  value: string;
  readonly?: boolean;
}

const REQUIRED_AGENTS = new Set(["planner", "coder"]);

export class AgentsView extends InteractiveView {
  private viewState: ViewState = "list";
  private agents: AgentListItem[] = [];
  private list: ScrollableFilterList<AgentListItem>;
  private builtInDefs: Map<string, AgentDefinition> = new Map();

  // Detail state
  private detailAgent: AgentListItem | null = null;

  // Edit state
  private editAgent: AgentListItem | null = null;
  private editFields: EditField[] = [];
  private editFieldIndex = 0;
  private editing = false;
  private editBuffer = "";
  private editCursor = 0;
  private isCreating = false;

  // Delete state
  private deleteAgentId: string | null = null;

  constructor(tui: TUI, onClose: () => void) {
    super(tui, onClose);
    this.list = new ScrollableFilterList<AgentListItem>({
      renderItem: (item, _index, selected) => this.renderAgentItem(item, selected),
      filterFn: (item, query) => {
        const q = query.toLowerCase();
        return item.id.includes(q) || item.name.toLowerCase().includes(q)
          || item.description.toLowerCase().includes(q);
      },
      emptyMessage: "No agents",
      filterPlaceholder: "Type to search agents...",
    });
  }

  override activate(): void {
    this.filterEnabled = true;
    this.filterText = "";
    this.viewState = "list";
    void this.loadAgents();
    super.activate();
  }

  private async loadAgents(): Promise<void> {
    const { AgentRegistry } = await import("../../router/agent-registry.js");
    const registry = new AgentRegistry();
    const builtIn = registry.getAll();
    this.builtInDefs.clear();
    for (const def of builtIn) this.builtInDefs.set(def.id, def);

    const customConfigs = getAllAgentConfigs();
    const items: AgentListItem[] = [];

    // Built-in agents
    for (const def of builtIn) {
      const override = customConfigs[def.id];
      items.push({
        id: def.id,
        name: override?.name ?? def.name,
        description: override?.description ?? def.description,
        isBuiltIn: true,
        isCustom: false,
        tools: def.defaultTools,
        systemPrompt: def.systemPrompt,
      });
    }

    // Custom agents from config
    for (const [id, cfg] of Object.entries(customConfigs)) {
      if (isBuiltInAgent(id)) continue;
      if (!cfg.custom) continue;
      const baseRole = cfg.role ?? "coder";
      const baseDef = this.builtInDefs.get(baseRole);
      items.push({
        id,
        name: cfg.name ?? id,
        description: cfg.description ?? "",
        isBuiltIn: false,
        isCustom: true,
        tools: cfg.tools ?? baseDef?.defaultTools ?? [],
        systemPrompt: baseDef?.systemPrompt ?? "",
      });
    }

    this.agents = items;
    this.list.setItems(items);
    this.render();
  }

  protected getItemCount(): number {
    if (this.viewState === "list") return this.list.getFilteredCount(this.filterText) + 1; // +1 for "Create"
    if (this.viewState === "edit") return this.editFields.length;
    if (this.viewState === "delete") return 1;
    return 1; // detail
  }

  protected override isEditing(): boolean { return this.editing; }
  protected override cancelEdit(): void {
    this.editing = false;
    this.editBuffer = "";
    this.editCursor = 0;
  }

  protected handleCustomKey(event: KeyEvent): boolean {
    switch (this.viewState) {
      case "list": return this.handleListKey(event);
      case "detail": return this.handleDetailKey(event);
      case "edit": return this.handleEditKey(event);
      case "delete": return this.handleDeleteKey(event);
    }
  }

  // ── List view ──────────────────────────────────────────────

  private handleListKey(event: KeyEvent): boolean {
    if (event.type === "enter") {
      const filtered = this.list.getFilteredItems(this.filterText);
      if (this.selectedIndex < filtered.length) {
        this.detailAgent = filtered[this.selectedIndex]!;
        this.viewState = "detail";
        this.selectedIndex = 0;
      } else {
        // "Create custom agent" action
        this.startCreate();
      }
      this.render();
      return true;
    }

    if (event.type === "char" && event.char === "a" && !event.ctrl) {
      this.startCreate();
      this.render();
      return true;
    }

    if (event.type === "char" && event.char === "d" && !event.ctrl) {
      const filtered = this.list.getFilteredItems(this.filterText);
      const agent = filtered[this.selectedIndex];
      if (agent) {
        if (agent.isBuiltIn) {
          // Briefly show warning — just re-render with a flash (no state needed, just consume)
          return true;
        }
        this.deleteAgentId = agent.id;
        this.viewState = "delete";
        this.render();
      }
      return true;
    }

    if (event.type === "escape") {
      this.deactivate();
      return true;
    }

    return true;
  }

  // ── Detail view ────────────────────────────────────────────

  private handleDetailKey(event: KeyEvent): boolean {
    if (event.type === "char" && event.char === "e" && !event.ctrl) {
      if (this.detailAgent) {
        this.startEdit(this.detailAgent);
        this.render();
      }
      return true;
    }

    if (event.type === "char" && event.char === "d" && !event.ctrl) {
      if (this.detailAgent) {
        if (this.detailAgent.isBuiltIn) return true;
        this.deleteAgentId = this.detailAgent.id;
        this.viewState = "delete";
        this.render();
      }
      return true;
    }

    if (event.type === "escape") {
      this.viewState = "list";
      this.selectedIndex = 0;
      this.render();
      return true;
    }

    return true;
  }

  // ── Edit view ──────────────────────────────────────────────

  private startEdit(agent: AgentListItem): void {
    this.editAgent = agent;
    this.isCreating = false;
    const override = getAgentConfig(agent.id) ?? {};
    this.editFields = [
      { key: "name", label: "Name", value: override.name ?? agent.name },
      { key: "description", label: "Description", value: override.description ?? agent.description },
      { key: "modelOverride", label: "Model", value: override.modelOverride ?? "(global default)" },
      { key: "temperature", label: "Temperature", value: String(override.temperature ?? "0.2") },
      { key: "maxTurns", label: "Max turns", value: String(override.maxTurns ?? "25") },
      { key: "systemPromptAppend", label: "Prompt append", value: override.systemPromptAppend ?? "" },
    ];
    this.editFieldIndex = 0;
    this.selectedIndex = 0;
    this.viewState = "edit";
  }

  private startCreate(): void {
    this.editAgent = null;
    this.isCreating = true;
    this.editFields = [
      { key: "id", label: "ID", value: "" },
      { key: "name", label: "Name", value: "" },
      { key: "role", label: "Role (inherit from)", value: "coder" },
      { key: "description", label: "Description", value: "" },
      { key: "modelOverride", label: "Model", value: "(global default)" },
      { key: "temperature", label: "Temperature", value: "0.2" },
      { key: "maxTurns", label: "Max turns", value: "25" },
      { key: "systemPromptAppend", label: "Prompt append", value: "" },
    ];
    this.editFieldIndex = 0;
    this.selectedIndex = 0;
    this.viewState = "edit";
  }

  private handleEditKey(event: KeyEvent): boolean {
    if (this.editing) {
      const result = handleTextInput(event, this.editBuffer, this.editCursor);
      if (result.handled) {
        this.editBuffer = result.text;
        this.editCursor = result.cursor;
        this.render();
        return true;
      }
      if (event.type === "enter") {
        // Commit edit
        this.editFields[this.editFieldIndex]!.value = this.editBuffer;
        this.editing = false;
        this.render();
        return true;
      }
      if (event.type === "escape") {
        this.editing = false;
        this.render();
        return true;
      }
      return true;
    }

    // Not editing — navigate fields
    if (event.type === "enter") {
      const field = this.editFields[this.selectedIndex];
      if (field && !field.readonly) {
        this.editing = true;
        this.editBuffer = field.value === "(global default)" ? "" : field.value;
        this.editCursor = this.editBuffer.length;
        this.editFieldIndex = this.selectedIndex;
        this.render();
      }
      return true;
    }

    // Tab / Shift+Tab to save
    if (event.type === "tab" && !event.shift) {
      this.saveEdit();
      return true;
    }

    // Ctrl+S to save
    if (event.type === "char" && event.char === "s" && event.ctrl) {
      this.saveEdit();
      return true;
    }

    if (event.type === "escape") {
      this.viewState = this.isCreating ? "list" : "detail";
      this.selectedIndex = 0;
      this.render();
      return true;
    }

    return true;
  }

  private saveEdit(): void {
    const fields = Object.fromEntries(this.editFields.map((f) => [f.key, f.value]));

    if (this.isCreating) {
      const id = fields.id?.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
      if (!id) return;
      if (isBuiltInAgent(id) || this.agents.some((a) => a.id === id)) return;

      setAgentConfig(id, {
        name: fields.name || id,
        description: fields.description || "",
        role: fields.role || "coder",
        modelOverride: fields.modelOverride === "(global default)" ? undefined : fields.modelOverride || undefined,
        temperature: parseFloat(fields.temperature || "0.2") || 0.2,
        maxTurns: parseInt(fields.maxTurns || "25") || 25,
        systemPromptAppend: fields.systemPromptAppend || undefined,
        custom: true,
      });
    } else if (this.editAgent) {
      const existing = getAgentConfig(this.editAgent.id) ?? {};
      setAgentConfig(this.editAgent.id, {
        ...existing,
        name: fields.name || undefined,
        description: fields.description || undefined,
        modelOverride: fields.modelOverride === "(global default)" ? undefined : fields.modelOverride || undefined,
        temperature: parseFloat(fields.temperature || "0.2") || 0.2,
        maxTurns: parseInt(fields.maxTurns || "25") || 25,
        systemPromptAppend: fields.systemPromptAppend || undefined,
      });
    }

    this.viewState = "list";
    this.selectedIndex = 0;
    void this.loadAgents();
  }

  // ── Delete view ────────────────────────────────────────────

  private handleDeleteKey(event: KeyEvent): boolean {
    if (event.type === "char" && event.char === "y" && !event.ctrl) {
      if (this.deleteAgentId) {
        deleteAgentConfig(this.deleteAgentId);
        this.deleteAgentId = null;
        this.detailAgent = null;
        this.viewState = "list";
        this.selectedIndex = 0;
        void this.loadAgents();
      }
      return true;
    }
    if (event.type === "char" && event.char === "n" && !event.ctrl) {
      this.viewState = this.detailAgent ? "detail" : "list";
      this.deleteAgentId = null;
      this.render();
      return true;
    }
    if (event.type === "escape") {
      this.viewState = this.detailAgent ? "detail" : "list";
      this.deleteAgentId = null;
      this.render();
      return true;
    }
    return true;
  }

  // ── Rendering ──────────────────────────────────────────────

  protected override getPanelTitle(): string {
    switch (this.viewState) {
      case "list": return `${ICONS.bolt} Agents`;
      case "detail": return `${ICONS.bolt} ${this.detailAgent?.name ?? "Agent"}`;
      case "edit": return `${ICONS.bolt} ${this.isCreating ? "New Agent" : `Edit ${this.editAgent?.name ?? ""}`}`;
      case "delete": return `${ICONS.bolt} Delete Agent`;
    }
  }

  protected override getPanelFooter(): string {
    switch (this.viewState) {
      case "list": return `${ICONS.arrowUp}${ICONS.arrowDown} navigate \u00b7 Enter view \u00b7 a add \u00b7 d delete \u00b7 Esc close`;
      case "detail": return "e edit \u00b7 d delete \u00b7 Esc back";
      case "edit": return this.editing
        ? "Enter commit \u00b7 Esc cancel"
        : `${ICONS.arrowUp}${ICONS.arrowDown} navigate \u00b7 Enter edit field \u00b7 Tab save \u00b7 Esc cancel`;
      case "delete": return "y confirm \u00b7 n/Esc cancel";
    }
  }

  private renderAgentItem(item: AgentListItem, selected: boolean): string {
    const t = this.theme;
    const cursor = selected ? t.primary(`${ICONS.cursor} `) : "  ";
    const name = selected ? t.bold(item.id.padEnd(14)) : item.id.padEnd(14);
    const desc = t.dim(item.description.slice(0, 24).padEnd(24));
    const tag = item.isCustom ? t.dim(" (custom)")
      : REQUIRED_AGENTS.has(item.id) ? t.dim(" (required)")
      : t.dim(" (built-in)");
    return `    ${cursor}${name} ${desc}${tag}`;
  }

  protected renderLines(): string[] {
    switch (this.viewState) {
      case "list": return this.renderList();
      case "detail": return this.renderDetail();
      case "edit": return this.renderEditForm();
      case "delete": return this.renderDeleteConfirm();
    }
  }

  private renderList(): string[] {
    const t = this.theme;
    const lines: string[] = [];
    lines.push("");

    const listLines = this.list.renderLines({
      filterText: this.filterText,
      selectedIndex: this.selectedIndex,
      scrollOffset: this.scrollOffset,
      maxVisible: Math.max(3, this.maxVisible - 4),
    });
    lines.push(...listLines);

    // "Create custom agent" action
    lines.push(`  ${"─".repeat(38)}`);
    const createSelected = this.selectedIndex === this.list.getFilteredCount(this.filterText);
    const createCursor = createSelected ? t.primary(`${ICONS.cursor} `) : "  ";
    const createLabel = createSelected ? t.bold("+ Create custom agent...") : t.dim("+ Create custom agent...");
    lines.push(`    ${createCursor}${createLabel}`);
    lines.push("");
    return lines;
  }

  private renderDetail(): string[] {
    const t = this.theme;
    const agent = this.detailAgent;
    if (!agent) return ["  No agent selected"];

    const override = getAgentConfig(agent.id);
    const lines: string[] = [];
    lines.push("");
    lines.push(`  ${"─".repeat(38)}`);
    lines.push(`  ${t.dim("Name:")}        ${agent.name}`);
    lines.push(`  ${t.dim("Role:")}        ${agent.id}${agent.isBuiltIn ? t.dim(" (built-in)") : t.dim(" (custom)")}`);
    lines.push(`  ${t.dim("Description:")} ${agent.description}`);
    lines.push(`  ${t.dim("Model:")}       ${override?.modelOverride ?? "(global default)"}`);
    lines.push(`  ${t.dim("Temperature:")} ${override?.temperature ?? "0.2"}`);
    lines.push(`  ${t.dim("Max turns:")}   ${override?.maxTurns ?? "25"}`);
    lines.push(`  ${t.dim("Tools:")}       ${agent.tools.join(", ")}`);
    lines.push(`  ${"─".repeat(38)}`);

    // System prompt preview
    lines.push(`  ${t.dim("System prompt:")}`);
    const prompt = agent.systemPrompt;
    const promptLines = prompt.split("\n").slice(0, 3);
    for (const pl of promptLines) {
      lines.push(`  ${t.dim(pl.slice(0, 60))}`);
    }
    if (prompt.split("\n").length > 3) {
      lines.push(`  ${t.dim("...")}`);
    }

    if (override?.systemPromptAppend) {
      lines.push("");
      lines.push(`  ${t.dim("Prompt append:")}`);
      const appendLines = override.systemPromptAppend.split("\n").slice(0, 3);
      for (const al of appendLines) {
        lines.push(`  ${t.dim(al.slice(0, 60))}`);
      }
    }

    lines.push(`  ${"─".repeat(38)}`);
    lines.push("");
    return lines;
  }

  private renderEditForm(): string[] {
    const t = this.theme;
    const lines: string[] = [];
    lines.push("");

    for (let i = 0; i < this.editFields.length; i++) {
      const field = this.editFields[i]!;
      const isSelected = i === this.selectedIndex;
      const isEditing = this.editing && i === this.editFieldIndex;
      const cursor = isSelected ? t.primary(ICONS.cursor) : t.dim("\u2502");
      const label = `${field.label}:`.padEnd(16);

      if (isEditing) {
        const before = this.editBuffer.slice(0, this.editCursor);
        const after = this.editBuffer.slice(this.editCursor);
        lines.push(`  ${cursor} ${t.bold(label)} ${before}${t.primary(ICONS.block)}${after}`);
      } else if (field.readonly) {
        lines.push(`  ${cursor} ${t.dim(label)} ${t.dim(field.value)}`);
      } else if (isSelected) {
        lines.push(`  ${cursor} ${t.bold(label)} ${field.value || t.dim("(empty)")}`);
      } else {
        lines.push(`  ${cursor} ${t.dim(label)} ${field.value || t.dim("(empty)")}`);
      }
    }

    lines.push("");
    return lines;
  }

  private renderDeleteConfirm(): string[] {
    const t = this.theme;
    const lines: string[] = [];
    lines.push("");
    lines.push(`  ${t.warning(ICONS.warning)} Delete "${this.deleteAgentId}"?`);
    lines.push(`  ${t.dim("This cannot be undone.")}`);
    lines.push("");
    lines.push(`  ${t.dim("Press")} y ${t.dim("to confirm or")} n ${t.dim("to cancel")}`);
    lines.push("");
    return lines;
  }
}
