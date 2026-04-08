/**
 * Tests for SetupWizardView — TUI-native setup wizard (4 steps).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ── Mock all external dependencies before import ────────────

vi.mock("../../../src/providers/detect.js", () => ({
  detectProviders: vi.fn(),
}));

vi.mock("../../../src/providers/validate.js", () => ({
  validateApiKey: vi.fn(),
}));

vi.mock("../../../src/providers/model-fetcher.js", () => ({
  fetchModelsForProvider: vi.fn(),
}));

vi.mock("../../../src/providers/model-cache.js", () => ({
  getCachedModels: vi.fn().mockResolvedValue(null),
  setCachedModels: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/credentials/credential-store.js", () => ({
  CredentialStore: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue({ isOk: () => true }),
    setCredential: vi.fn().mockResolvedValue({ isOk: () => true }),
  })),
}));

vi.mock("../../../src/core/global-config.js", () => ({
  readGlobalConfig: vi.fn().mockReturnValue(null),
  writeGlobalConfig: vi.fn().mockReturnValue("/home/test/.openpawl/config.json"),
}));

vi.mock("../../../src/providers/provider-catalog.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/providers/provider-catalog.js")>(
    "../../../src/providers/provider-catalog.js",
  );
  return actual;
});

vi.mock("../../../src/credentials/masking.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/credentials/masking.js")>(
    "../../../src/credentials/masking.js",
  );
  return actual;
});

import { SetupWizardView } from "../../../src/app/interactive/setup-wizard-view.js";
import { detectProviders } from "../../../src/providers/detect.js";
import { validateApiKey } from "../../../src/providers/validate.js";
import { fetchModelsForProvider } from "../../../src/providers/model-fetcher.js";
import { writeGlobalConfig } from "../../../src/core/global-config.js";
import type { DetectedProvider } from "../../../src/providers/detect.js";
import type { TUI } from "../../../src/tui/core/tui.js";

// ── Minimal TUI mock ────────────────────────────────────────

function createMockTUI() {
  return {
    pushKeyHandler: vi.fn(),
    popKeyHandler: vi.fn(),
    setInteractiveView: vi.fn(),
    clearInteractiveView: vi.fn(),
    setFixedBottomHidden: vi.fn(),
    setScrollableHidden: vi.fn(),
    getLayout: vi.fn(() => ({
      breakpoint: "md", cols: 100, rows: 30, maxInputLines: 8,
      maxSelectItems: 10, showBorder: true, showAsciiArt: true,
      contentPadding: 2, messageBubblePercent: 0.70,
      heightBreakpoint: "medium",
    })),
    setClickHandler: vi.fn(),
    getInteractiveStartRow: vi.fn(() => 10),
    requestRender: vi.fn(),
    getTerminal: vi.fn(() => ({ columns: 100, rows: 30 })),
  } as unknown as TUI;
}

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 10));
}

function getLastRendered(tui: TUI): string {
  const calls = (tui.setInteractiveView as Mock).mock.calls;
  const lastCall = calls.at(-1)?.[0] as string[];
  return lastCall?.join("\n") ?? "";
}

describe("SetupWizardView", () => {
  let tui: TUI;
  let onClose: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    tui = createMockTUI();
    onClose = vi.fn();
  });

  it("shows all providers after detection, with detected ones marked", async () => {
    const detected: DetectedProvider[] = [
      { type: "anthropic", available: true, source: "env", envKey: "ANTHROPIC_API_KEY" },
      { type: "ollama", available: false, source: "ollama" },
    ];
    (detectProviders as Mock).mockResolvedValue(detected);

    const wizard = new SetupWizardView(tui, onClose);
    wizard.activate();
    await flush();

    const rendered = getLastRendered(tui);
    // Detected providers should be shown
    expect(rendered).toContain("Anthropic");
    // All providers section should show undetected ones too
    expect(rendered).toContain("OpenAI");
    expect(rendered).toContain("All Providers");
  });

  it("skips API_KEY step for local providers", async () => {
    const detected: DetectedProvider[] = [
      { type: "ollama", available: true, source: "ollama", models: ["llama3"] },
    ];
    (detectProviders as Mock).mockResolvedValue(detected);
    (fetchModelsForProvider as Mock).mockResolvedValue({
      models: [{ id: "llama3", name: "llama3", isChatModel: true }],
      source: "live",
    });

    const wizard = new SetupWizardView(tui, onClose);
    wizard.activate();
    await flush();

    // PROVIDER step — select ollama (first detected item)
    wizard.handleKey({ type: "enter", shift: false });
    await flush();

    // Should jump to MODEL step (skipping API_KEY)
    const rendered = getLastRendered(tui);
    expect(rendered).toContain("Model");
  });

  it("saves config on confirm step", async () => {
    const detected: DetectedProvider[] = [
      { type: "anthropic", available: true, source: "env", envKey: "ANTHROPIC_API_KEY" },
    ];
    (detectProviders as Mock).mockResolvedValue(detected);
    (validateApiKey as Mock).mockResolvedValue({
      isOk: () => true,
      isErr: () => false,
      value: { latencyMs: 150 },
      error: undefined,
    });
    (fetchModelsForProvider as Mock).mockResolvedValue({
      models: [
        { id: "claude-sonnet-4-6", name: "claude-sonnet-4-6", isChatModel: true },
        { id: "claude-opus-4-6", name: "claude-opus-4-6", isChatModel: true },
      ],
      source: "live",
    });

    const origKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-1234567890";

    try {
      const wizard = new SetupWizardView(tui, onClose);
      wizard.activate();
      await flush();

      // PROVIDER step — select Anthropic
      wizard.handleKey({ type: "enter", shift: false });
      await flush();

      // API_KEY step — env key auto-filled, Enter to validate
      wizard.handleKey({ type: "enter", shift: false });
      await flush();

      // MODEL step — select first model
      wizard.handleKey({ type: "enter", shift: false });
      await flush();

      // CONFIRM step — Enter to save
      wizard.handleKey({ type: "enter", shift: false });

      expect(writeGlobalConfig).toHaveBeenCalledTimes(1);
      const savedConfig = (writeGlobalConfig as Mock).mock.calls[0]![0];
      expect(savedConfig.activeProvider).toBe("anthropic");
      expect(savedConfig.activeModel).toBe("claude-sonnet-4-6");
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      if (origKey !== undefined) {
        process.env.ANTHROPIC_API_KEY = origKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    }
  });
});
