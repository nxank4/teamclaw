import { describe, it, expect, beforeEach, mock } from "bun:test";

// Stub global-config so setConfig/removeConfig don't touch ~/.openpawl/config.json.
// Must run before the registry imports global-config transitively.
mock.module("../../src/core/global-config.js", () => ({
  readGlobalConfig: () => ({ providers: [], activeProvider: null }),
  writeGlobalConfig: () => {},
}));

import { ProviderRegistry, resetProviderRegistry, getProviderRegistry } from "../../src/providers/provider-registry.js";

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    resetProviderRegistry();
    registry = new ProviderRegistry();
  });

  describe("definitions", () => {
    it("returns all providers from catalog", () => {
      const all = registry.getAll();
      expect(all.length).toBeGreaterThan(20);
      expect(all.map((d) => d.id)).toContain("anthropic");
      expect(all.map((d) => d.id)).toContain("ollama");
      expect(all.map((d) => d.id)).toContain("openai");
    });

    it("returns null for unknown provider", () => {
      expect(registry.getDefinition("nonexistent")).toBeNull();
    });

    it("returns definition with correct fields", () => {
      const def = registry.getDefinition("anthropic");
      expect(def).not.toBeNull();
      expect(def!.id).toBe("anthropic");
      expect(def!.displayName).toContain("Anthropic");
      expect(def!.category).toBe("apikey");
      expect(def!.authMethod).toBe("apikey");
      expect(def!.openaiCompatible).toBe(false);
      expect(def!.defaultModels.length).toBeGreaterThan(0);
    });

    it("marks local providers as supporting model listing", () => {
      const ollama = registry.getDefinition("ollama");
      expect(ollama!.supportsModelListing).toBe(true);

      const lmstudio = registry.getDefinition("lmstudio");
      expect(lmstudio!.supportsModelListing).toBe(true);
    });

    it("marks API providers as not supporting model listing", () => {
      const anthropic = registry.getDefinition("anthropic");
      expect(anthropic!.supportsModelListing).toBe(false);
    });

    it("filters by category", () => {
      const local = registry.getByCategory("local");
      expect(local.length).toBeGreaterThan(0);
      expect(local.every((d) => d.category === "local")).toBe(true);
      expect(local.map((d) => d.id)).toContain("ollama");
    });
  });

  describe("runtime state", () => {
    it("returns unconfigured state for provider without config", () => {
      const state = registry.getState("anthropic");
      expect(state.configured).toBe(false);
      expect(state.models.length).toBeGreaterThan(0); // falls back to defaults
    });

    it("returns default models when no discovery data exists", () => {
      const models = registry.getModels("anthropic");
      expect(models.length).toBeGreaterThan(0);
      // Should include known Anthropic models from catalog
      expect(models.some((m) => m.includes("claude"))).toBe(true);
    });
  });

  describe("events", () => {
    it("emits config:changed with providerId on setConfig", () => {
      const handler = mock(() => {});
      registry.on("config:changed", handler);
      registry.setConfig("anthropic", { apiKey: "sk-test" });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]?.[0]).toBe("anthropic");
    });

    it("emits config:changed with providerId on removeConfig", () => {
      const handler = mock(() => {});
      registry.on("config:changed", handler);
      registry.removeConfig("anthropic");
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]?.[0]).toBe("anthropic");
    });
  });

  describe("singleton", () => {
    it("returns same instance from getProviderRegistry()", () => {
      const a = getProviderRegistry();
      const b = getProviderRegistry();
      expect(a).toBe(b);
    });

    it("returns new instance after reset", () => {
      const a = getProviderRegistry();
      resetProviderRegistry();
      const b = getProviderRegistry();
      expect(a).not.toBe(b);
    });
  });
});
