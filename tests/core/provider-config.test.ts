import { describe, it, expect, beforeEach, mock } from "bun:test";

// Stub global-config so setActiveProvider doesn't touch ~/.openpawl/config.json.
// The captured-write holder lets us assert what would have been persisted.
const captured: { written: { activeProvider?: string } | null } = { written: null };

mock.module("../../src/core/global-config.js", () => ({
  readGlobalConfig: () => ({ providers: [], activeProvider: "", activeModel: "" }),
  writeGlobalConfig: (cfg: { activeProvider?: string }) => {
    captured.written = cfg;
  },
  buildDefaultGlobalConfig: () => ({ providers: [], activeProvider: "", activeModel: "" }),
}));

import { setActiveProvider } from "../../src/core/provider-config.js";
import { resetActiveProviderState } from "../../src/providers/active-state.js";

describe("provider-config: setActiveProvider case normalization", () => {
  beforeEach(() => {
    captured.written = null;
    resetActiveProviderState();
  });

  it("normalizes mixed-case provider name to lowercase on write", () => {
    setActiveProvider("Anthropic");
    expect(captured.written).not.toBeNull();
    expect(captured.written!.activeProvider).toBe("anthropic");
  });

  it("leaves already-lowercase provider name unchanged", () => {
    setActiveProvider("openai");
    expect(captured.written!.activeProvider).toBe("openai");
  });

  it("trims surrounding whitespace and lowercases", () => {
    setActiveProvider("  OpenRouter  ");
    expect(captured.written!.activeProvider).toBe("openrouter");
  });

  it("does not write when input is empty or whitespace-only", () => {
    setActiveProvider("   ");
    expect(captured.written).toBeNull();
  });
});
