import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DetectedProvider } from "../../src/providers/detect.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("detectProviders", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    for (const key of Object.keys(process.env)) {
      if (key.includes("API_KEY") || key.includes("GITHUB_TOKEN") || key.includes("AWS_")) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("detects ANTHROPIC_API_KEY from env", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    // Ollama/LMStudio probes fail
    mockFetch.mockRejectedValue(new Error("no local"));
    const { detectProviders } = await import("../../src/providers/detect.js");
    const result = await detectProviders();
    const anthropic = result.find((p) => p.type === "anthropic");
    expect(anthropic).toBeDefined();
    expect(anthropic!.available).toBe(true);
    expect(anthropic!.source).toBe("env");
    expect(anthropic!.envKey).toBe("ANTHROPIC_API_KEY");
  });

  it("detects Ollama when reachable", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ models: [{ name: "llama3" }, { name: "codellama" }] }),
    });
    // LM Studio fails
    mockFetch.mockRejectedValueOnce(new Error("no lmstudio"));
    const { detectProviders } = await import("../../src/providers/detect.js");
    const result = await detectProviders();
    const ollama = result.find((p) => p.type === "ollama");
    expect(ollama).toBeDefined();
    expect(ollama!.available).toBe(true);
    expect(ollama!.models).toEqual(["llama3", "codellama"]);
    expect(ollama!.source).toBe("ollama");
  });

  it("marks Ollama unavailable on timeout", async () => {
    mockFetch.mockRejectedValueOnce(new Error("fetch failed"));
    const { detectProviders } = await import("../../src/providers/detect.js");
    const result = await detectProviders();
    const ollama = result.find((p) => p.type === "ollama");
    expect(ollama).toBeDefined();
    expect(ollama!.available).toBe(false);
  });

  it("sorts available providers first", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    mockFetch.mockRejectedValue(new Error("no ollama"));
    const { detectProviders } = await import("../../src/providers/detect.js");
    const result = await detectProviders();
    const firstAvailable = result.findIndex((p) => p.available);
    const firstUnavailable = result.findIndex((p) => !p.available);
    if (firstAvailable >= 0 && firstUnavailable >= 0) {
      expect(firstAvailable).toBeLessThan(firstUnavailable);
    }
  });

  it("returns empty models for env-detected providers", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-deep-test";
    mockFetch.mockRejectedValue(new Error("no local"));
    const { detectProviders } = await import("../../src/providers/detect.js");
    const result = await detectProviders();
    const deepseek = result.find((p) => p.type === "deepseek");
    expect(deepseek).toBeDefined();
    expect(deepseek!.models).toBeUndefined();
  });
});
