import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { findModel, invalidateModelCache, type DiscoveredModel } from "../../src/providers/model-discovery.js";

describe("model-discovery", () => {
  beforeEach(() => {
    invalidateModelCache();
  });

  describe("findModel", () => {
    const models: DiscoveredModel[] = [
      { provider: "ollama", model: "llama3.1:latest", displayName: "Llama 3.1", status: "available" },
      { provider: "anthropic", model: "claude-sonnet-4-20250514", displayName: "Claude Sonnet 4", status: "configured" },
      { provider: "anthropic", model: "claude-opus-4-20250514", displayName: "Claude Opus 4", status: "configured" },
      { provider: "openai", model: "gpt-4o", displayName: "GPT-4o", status: "not_configured" },
    ];

    it("exact match works", () => {
      expect(findModel("llama3.1:latest", models)?.model).toBe("llama3.1:latest");
    });

    it("prefix match: 'llama3' matches 'llama3.1:latest'", () => {
      expect(findModel("llama3", models)?.model).toBe("llama3.1:latest");
    });

    it("substring match: 'sonnet' matches 'claude-sonnet-4-...'", () => {
      expect(findModel("sonnet", models)?.model).toBe("claude-sonnet-4-20250514");
    });

    it("display name match: 'Opus' matches via displayName", () => {
      expect(findModel("Opus", models)?.model).toBe("claude-opus-4-20250514");
    });

    it("returns undefined for no match", () => {
      expect(findModel("nonexistent", models)).toBeUndefined();
    });

    it("case insensitive", () => {
      expect(findModel("LLAMA3", models)?.model).toBe("llama3.1:latest");
    });
  });

  it("invalidateModelCache clears cache", () => {
    // Just verify it doesn't throw
    invalidateModelCache();
    invalidateModelCache();
  });
});
