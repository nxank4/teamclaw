/**
 * TUI-native setup wizard — 4-step flow for configuring a provider.
 * State machine: PROVIDER → API_KEY → MODEL → CONFIRM
 *
 * PROVIDER step auto-detects available providers and shows ALL providers
 * from the catalog with detected ones sorted to top and marked.
 */
import type { KeyEvent } from "../../tui/core/input.js";
import type { TUI } from "../../tui/core/tui.js";
import type { DetectedProvider } from "../../providers/detect.js";
import type { OpenPawlGlobalConfig, ProviderConfigEntry } from "../../core/global-config.js";
import { InteractiveView } from "./base-view.js";
import { renderPanel } from "../../tui/components/panel.js";
import { detectProviders } from "../../providers/detect.js";
import { PROVIDER_CATALOG, getProviderMeta } from "../../providers/provider-catalog.js";
import { validateApiKey } from "../../providers/validate.js";
import { fetchModelsForProvider } from "../../providers/model-fetcher.js";
import { getCachedModels, setCachedModels } from "../../providers/model-cache.js";
import { readGlobalConfig, writeGlobalConfig } from "../../core/global-config.js";
import { CredentialStore } from "../../credentials/credential-store.js";
import { maskCredential } from "../../credentials/masking.js";

enum WizardStep { PROVIDER, API_KEY, MODEL, CONFIRM }

interface ProviderItem {
  type: "provider" | "separator" | "header";
  id?: string;
  label: string;
  hint?: string;
  detected?: boolean;
}

export class SetupWizardView extends InteractiveView {
  private step = WizardStep.PROVIDER;
  private detected: DetectedProvider[] = [];
  private providerItems: ProviderItem[] = [];
  private selectedProvider = "";
  private needsKey = false;
  private apiKey = "";
  private editBuffer = "";
  private editCursor = 0;
  private models: string[] = [];
  private selectedModel = "";
  private validationError: string | null = null;
  private loading = false;
  private loadingText = "";
  private healthLatency = 0;
  private prefill?: OpenPawlGlobalConfig;
  private envKeySource: string | null = null;

  constructor(tui: TUI, onClose: () => void, prefill?: OpenPawlGlobalConfig) {
    super(tui, onClose);
    this.prefill = prefill;
  }

  override activate(): void {
    this.step = WizardStep.PROVIDER;
    this.selectedIndex = 0;
    this.loading = true;
    this.loadingText = "Scanning for providers...";
    this.buildProviderItems(); // show all providers immediately (no detection yet)
    super.activate();
    void this.runDetection();
  }

  // ── InteractiveView abstract methods ──────────────────────

  protected getItemCount(): number {
    switch (this.step) {
      case WizardStep.PROVIDER: return this.getSelectableProviderCount();
      case WizardStep.API_KEY: return 1;
      case WizardStep.MODEL: return this.models.length;
      case WizardStep.CONFIRM: return 1;
    }
  }

  protected override isEditing(): boolean {
    return this.step === WizardStep.API_KEY && !this.envKeySource;
  }

  protected override cancelEdit(): void {
    this.editBuffer = "";
    this.editCursor = 0;
    this.validationError = null;
  }

  protected handleCustomKey(event: KeyEvent): boolean {
    if (event.type === "tab" && event.shift) {
      this.goBack();
      return true;
    }

    if (event.type === "escape") {
      if (this.step === WizardStep.PROVIDER) {
        this.deactivate();
      } else {
        this.goBack();
      }
      return true;
    }

    switch (this.step) {
      case WizardStep.PROVIDER: return this.handleProviderKey(event);
      case WizardStep.API_KEY: return this.handleApiKeyKey(event);
      case WizardStep.MODEL: return this.handleModelKey(event);
      case WizardStep.CONFIRM: return this.handleConfirmKey(event);
    }
  }

  protected override getPanelTitle(): string {
    const stepNum = this.step + 1;
    const titles: Record<WizardStep, string> = {
      [WizardStep.PROVIDER]: "Select Provider",
      [WizardStep.API_KEY]: "API Key",
      [WizardStep.MODEL]: "Select Model",
      [WizardStep.CONFIRM]: "Confirm",
    };
    return `Setup (${stepNum}/4) — ${titles[this.step]}`;
  }

  protected override getPanelFooter(): string {
    switch (this.step) {
      case WizardStep.PROVIDER: return this.loading ? "Scanning..." : "↑↓ navigate · Enter select · Esc close";
      case WizardStep.API_KEY: return "Type key, Enter to validate · Esc back";
      case WizardStep.MODEL: return "↑↓ navigate · Enter select · Esc back";
      case WizardStep.CONFIRM: return "Enter save · Esc back";
    }
  }

  protected override render(): void {
    this.rowToItem.clear();
    const contentLines = this.renderLines();
    const title = this.getPanelTitle();
    const footer = this.getPanelFooter();
    const cols = this.tui.getTerminal().columns;
    const width = Math.max(60, Math.min(cols - 6, 90));
    const panelLines = renderPanel({ title, footer, width }, contentLines);
    this.tui.setInteractiveView(panelLines);
  }

  protected renderLines(): string[] {
    switch (this.step) {
      case WizardStep.PROVIDER: return this.renderProvider();
      case WizardStep.API_KEY: return this.renderApiKey();
      case WizardStep.MODEL: return this.renderModel();
      case WizardStep.CONFIRM: return this.renderConfirm();
    }
  }

  // ── Step: PROVIDER (merged with detection) ────────────────

  private async runDetection(): Promise<void> {
    try {
      this.detected = await detectProviders();
    } catch {
      this.detected = [];
    }
    this.loading = false;
    this.buildProviderItems();
    this.render();
  }

  private buildProviderItems(): void {
    this.providerItems = [];
    const detectedIds = new Set(this.detected.filter((d) => d.available).map((d) => d.type));

    // Detected providers section
    if (detectedIds.size > 0) {
      this.providerItems.push({ type: "header", label: "Detected" });
      for (const d of this.detected) {
        if (!d.available) continue;
        const meta = getProviderMeta(d.type);
        const detail = d.source === "env"
          ? `${d.envKey} found in environment`
          : d.models?.length
            ? `${d.models.length} models available`
            : "running locally";
        this.providerItems.push({
          type: "provider",
          id: d.type,
          label: meta?.name ?? d.type,
          hint: detail,
          detected: true,
        });
      }
      this.providerItems.push({ type: "separator", label: "" });
    }

    // All providers section
    this.providerItems.push({ type: "header", label: "All Providers" });
    for (const [id, meta] of Object.entries(PROVIDER_CATALOG)) {
      if (detectedIds.has(id) || meta.group) continue;
      this.providerItems.push({
        type: "provider",
        id,
        label: meta.name,
        hint: meta.authMethod === "local" ? "local" : undefined,
      });
    }
  }

  private getSelectableProviderCount(): number {
    return this.providerItems.filter((i) => i.type === "provider").length;
  }

  private getSelectableIndex(visualIndex: number): ProviderItem | undefined {
    let count = 0;
    for (const item of this.providerItems) {
      if (item.type !== "provider") continue;
      if (count === visualIndex) return item;
      count++;
    }
    return undefined;
  }

  private handleProviderKey(event: KeyEvent): boolean {
    if (this.loading) return true; // consume while detecting

    if (event.type === "enter" || (event.type === "tab" && !event.shift)) {
      const item = this.getSelectableIndex(this.selectedIndex);
      if (!item || item.type !== "provider" || !item.id) return true;

      this.selectedProvider = item.id;
      const meta = getProviderMeta(item.id);
      this.needsKey = meta?.authMethod !== "local";

      if (this.needsKey) {
        this.prepareApiKeyStep();
        this.step = WizardStep.API_KEY;
      } else {
        this.step = WizardStep.MODEL;
        this.selectedIndex = 0;
        void this.loadModels();
      }
      this.render();
      return true;
    }

    return true;
  }

  private renderProvider(): string[] {
    const t = this.theme;
    const lines: string[] = [];

    if (this.loading) {
      lines.push("");
      lines.push(`  ${t.dim(this.loadingText)}`);
      lines.push("");
    }

    let selectableIdx = 0;
    for (const item of this.providerItems) {
      if (item.type === "header") {
        lines.push("");
        lines.push(`  ${t.bold(item.label)}`);
        lines.push(`  ${"─".repeat(40)}`);
        continue;
      }

      if (item.type === "separator") {
        lines.push("");
        continue;
      }

      const isSelected = selectableIdx === this.selectedIndex;
      this.registerClickRow(lines.length, selectableIdx);

      const prefix = item.detected ? t.success("✓") : " ";
      const cursor = isSelected ? t.primary("▸") : t.dim("│");
      const hint = item.hint ? t.dim(` — ${item.hint}`) : "";
      const label = isSelected ? t.bold(item.label) : item.label;
      lines.push(`  ${cursor} ${prefix} ${label}${hint}`);
      selectableIdx++;
    }

    lines.push("");
    return lines;
  }

  // ── Step: API_KEY ─────────────────────────────────────────

  private prepareApiKeyStep(): void {
    this.editBuffer = "";
    this.editCursor = 0;
    this.validationError = null;
    this.apiKey = "";
    this.envKeySource = null;

    const det = this.detected.find((d) => d.type === this.selectedProvider && d.available && d.source === "env");
    if (det?.envKey && process.env[det.envKey]) {
      this.apiKey = process.env[det.envKey]!;
      this.envKeySource = det.envKey;
    }
  }

  private handleApiKeyKey(event: KeyEvent): boolean {
    if (event.type === "backspace" && this.envKeySource) {
      this.goBack();
      return true;
    }

    if (this.envKeySource) {
      if (event.type === "enter" || (event.type === "tab" && !event.shift)) {
        void this.validateAndAdvance();
        return true;
      }
      return true;
    }

    if (event.type === "char" && !event.ctrl && !event.alt) {
      this.editBuffer = this.editBuffer.slice(0, this.editCursor) + event.char + this.editBuffer.slice(this.editCursor);
      this.editCursor++;
      this.validationError = null;
      this.render();
      return true;
    }
    if (event.type === "backspace") {
      if (this.editCursor > 0) {
        this.editBuffer = this.editBuffer.slice(0, this.editCursor - 1) + this.editBuffer.slice(this.editCursor);
        this.editCursor--;
      } else {
        this.goBack();
        return true;
      }
      this.validationError = null;
      this.render();
      return true;
    }
    if (event.type === "arrow" && event.direction === "left") {
      this.editCursor = Math.max(0, this.editCursor - 1);
      this.render();
      return true;
    }
    if (event.type === "arrow" && event.direction === "right") {
      this.editCursor = Math.min(this.editBuffer.length, this.editCursor + 1);
      this.render();
      return true;
    }
    if (event.type === "enter") {
      if (!this.editBuffer.trim()) {
        this.validationError = "API key is required";
        this.render();
        return true;
      }
      this.apiKey = this.editBuffer.trim();
      void this.validateAndAdvance();
      return true;
    }
    if (event.type === "paste") {
      this.editBuffer = this.editBuffer.slice(0, this.editCursor) + event.text + this.editBuffer.slice(this.editCursor);
      this.editCursor += event.text.length;
      this.validationError = null;
      this.render();
      return true;
    }

    return true;
  }

  private async validateAndAdvance(): Promise<void> {
    this.loading = true;
    this.loadingText = "Validating API key...";
    this.validationError = null;
    this.render();

    const meta = getProviderMeta(this.selectedProvider);
    const baseUrl = meta?.baseURL ?? "";
    const result = await validateApiKey(this.selectedProvider, this.apiKey, baseUrl);

    if (result.isErr()) {
      this.loading = false;
      this.validationError = result.error.message;
      this.render();
      return;
    }

    this.healthLatency = result.value.latencyMs;

    try {
      const store = new CredentialStore();
      await store.initialize();
      await store.setCredential(this.selectedProvider, "apiKey", this.apiKey);
    } catch { /* best-effort */ }

    this.loading = false;
    this.step = WizardStep.MODEL;
    this.selectedIndex = 0;
    void this.loadModels();
    this.render();
  }

  private renderApiKey(): string[] {
    const t = this.theme;
    const lines: string[] = [];
    const meta = getProviderMeta(this.selectedProvider);
    const providerName = meta?.name ?? this.selectedProvider;

    lines.push("");
    lines.push(`  ${t.bold("Provider:")} ${providerName}`);
    lines.push("");

    if (this.envKeySource) {
      lines.push(`  ${t.success("✓")} API key found in environment`);
      lines.push(`    ${t.dim("Source:")} ${t.bold(this.envKeySource)}`);
      lines.push(`    ${t.dim("Value:")}  ${maskCredential(this.apiKey)}`);
      lines.push("");
      if (this.loading) {
        lines.push(`  ${t.dim(this.loadingText)}`);
      } else {
        lines.push(`  ${t.dim("Press Enter to validate and continue")}`);
      }
    } else if (this.loading) {
      lines.push(`  ${t.dim(this.loadingText)}`);
    } else {
      lines.push(`  ${t.dim("Enter your API key for")} ${providerName}`);
      if (meta?.keyUrl) {
        lines.push(`  ${t.dim("Get one at:")} ${t.primary(meta.keyUrl)}`);
      }
      lines.push("");
      const display = "•".repeat(this.editBuffer.length);
      const before = display.slice(0, this.editCursor);
      const after = display.slice(this.editCursor);
      lines.push(`  ${t.dim("Key:")} ${before}${t.primary("█")}${after}`);
      lines.push(`        ${t.dim("(input is masked)")}`);
    }

    if (this.validationError) {
      lines.push("");
      lines.push(`  ${t.error("✗ " + this.validationError)}`);
    }

    lines.push("");
    return lines;
  }

  // ── Step: MODEL ───────────────────────────────────────────

  private async loadModels(): Promise<void> {
    this.loading = true;
    this.loadingText = "Fetching available models...";
    this.models = [];
    this.render();

    const cached = await getCachedModels(this.selectedProvider);
    if (cached && cached.length > 0) {
      this.models = cached;
      this.loading = false;
      this.render();
      return;
    }

    try {
      const result = await fetchModelsForProvider(this.selectedProvider, this.apiKey);
      if (result.models.length > 0) {
        this.models = result.models.map((m) => m.id);
        void setCachedModels(this.selectedProvider, this.models);
      }
    } catch { /* fallback */ }

    if (this.models.length === 0) {
      const meta = getProviderMeta(this.selectedProvider);
      if (meta) {
        this.models = meta.models.map((m) => m.id);
      }
    }

    this.loading = false;
    this.render();
  }

  private handleModelKey(event: KeyEvent): boolean {
    if (event.type === "backspace") {
      this.goBack();
      return true;
    }

    if (event.type === "enter" || (event.type === "tab" && !event.shift)) {
      if (this.models.length > 0 && this.selectedIndex < this.models.length) {
        this.selectedModel = this.models[this.selectedIndex]!;
        this.step = WizardStep.CONFIRM;
        this.selectedIndex = 0;
        this.render();
      }
      return true;
    }

    return true;
  }

  private renderModel(): string[] {
    const t = this.theme;
    const lines: string[] = [];
    const meta = getProviderMeta(this.selectedProvider);

    lines.push("");
    lines.push(`  ${t.bold("Provider:")} ${meta?.name ?? this.selectedProvider}`);
    lines.push("");

    if (this.loading) {
      lines.push(`  ${t.dim(this.loadingText)}`);
      lines.push("");
      return lines;
    }

    if (this.models.length === 0) {
      lines.push(`  ${t.error("No models available for this provider")}`);
      lines.push(`  ${t.dim("Press Esc to go back and try another provider")}`);
      lines.push("");
      return lines;
    }

    lines.push(`  ${t.dim("Choose a default model:")}`);
    lines.push("");

    for (let i = 0; i < this.models.length; i++) {
      const isSelected = i === this.selectedIndex;
      this.registerClickRow(lines.length, i);

      const model = this.models[i]!;
      const cursor = isSelected ? t.primary("▸") : t.dim("│");
      lines.push(`  ${cursor} ${isSelected ? t.bold(model) : model}`);
    }

    lines.push("");
    return lines;
  }

  // ── Step: CONFIRM ─────────────────────────────────────────

  private handleConfirmKey(event: KeyEvent): boolean {
    if (event.type === "enter" || (event.type === "tab" && !event.shift)) {
      this.saveConfig();
      return true;
    }
    return true;
  }

  private renderConfirm(): string[] {
    const t = this.theme;
    const lines: string[] = [];
    const meta = getProviderMeta(this.selectedProvider);

    lines.push("");
    lines.push(`  ${t.bold("Review your configuration:")}`);
    lines.push("");
    lines.push(`    ${t.dim("Provider")}   ${t.bold(meta?.name ?? this.selectedProvider)}`);
    lines.push(`    ${t.dim("Model")}      ${t.bold(this.selectedModel)}`);
    if (this.needsKey) {
      lines.push(`    ${t.dim("API Key")}    ${maskCredential(this.apiKey)}`);
    }
    lines.push("");

    if (this.healthLatency > 0) {
      lines.push(`  ${t.success("✓")} Connection verified (${this.healthLatency}ms)`);
    } else {
      lines.push(`  ${t.dim("Connection will be verified on first use")}`);
    }

    lines.push("");
    lines.push(`  ${t.dim("Press Enter to save and start using OpenPawl")}`);
    lines.push("");
    return lines;
  }

  private saveConfig(): void {
    const entry: ProviderConfigEntry = {
      type: this.selectedProvider as ProviderConfigEntry["type"],
      hasCredential: this.needsKey,
      model: this.selectedModel,
    };
    const existing = readGlobalConfig();
    const otherProviders = existing?.providers?.filter((p) => p.type !== this.selectedProvider) ?? [];
    const config: OpenPawlGlobalConfig = {
      ...(existing ?? { version: 1, dashboardPort: 9001, debugMode: false }),
      activeProvider: this.selectedProvider,
      activeModel: this.selectedModel,
      model: this.selectedModel,
      providers: [entry, ...otherProviders],
    };
    writeGlobalConfig(config);
    this.deactivate();
  }

  // ── Navigation ────────────────────────────────────────────

  private goBack(): void {
    switch (this.step) {
      case WizardStep.PROVIDER:
        this.deactivate();
        break;
      case WizardStep.API_KEY:
        this.step = WizardStep.PROVIDER;
        this.selectedIndex = 0;
        this.buildProviderItems();
        break;
      case WizardStep.MODEL:
        if (this.needsKey) {
          this.step = WizardStep.API_KEY;
          this.prepareApiKeyStep();
        } else {
          this.step = WizardStep.PROVIDER;
          this.selectedIndex = 0;
          this.buildProviderItems();
        }
        break;
      case WizardStep.CONFIRM:
        this.step = WizardStep.MODEL;
        this.selectedIndex = 0;
        break;
    }
    this.render();
  }

  // ── Key handler override ──────────────────────────────────

  override handleKey(event: KeyEvent): boolean {
    if (!this.active) return false;

    // Ctrl+C closes wizard
    if (event.type === "char" && event.char === "c" && event.ctrl) {
      this.deactivate();
      return true;
    }

    // Consume all other Ctrl+key combos
    if (event.type === "char" && event.ctrl) {
      return true;
    }

    // Don't let 'q' close the wizard
    if (event.type === "char" && event.char === "q" && !this.isEditing()) {
      return true;
    }

    // Escape handled by handleCustomKey
    if (event.type === "escape") {
      return this.handleCustomKey(event);
    }

    // Consume Ctrl+arrow
    if (event.type === "arrow" && event.ctrl) {
      return true;
    }

    // Arrow navigation in non-editing steps
    if (!this.isEditing()) {
      if (event.type === "arrow" && event.direction === "up") {
        this.selectedIndex = Math.max(0, this.selectedIndex - 1);
        this.render();
        return true;
      }
      if (event.type === "arrow" && event.direction === "down") {
        this.selectedIndex = Math.min(this.getItemCount() - 1, this.selectedIndex + 1);
        this.render();
        return true;
      }
    }

    return this.handleCustomKey(event);
  }
}
