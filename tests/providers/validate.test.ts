import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("validateApiKey", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns ok with latency for valid Anthropic key", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    const { validateApiKey } = await import("../../src/providers/validate.js");
    const result = await validateApiKey("anthropic", "sk-ant-test", "https://api.anthropic.com");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns err for rejected key", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    const { validateApiKey } = await import("../../src/providers/validate.js");
    const result = await validateApiKey("openai", "sk-bad", "https://api.openai.com/v1");
    expect(result.isErr()).toBe(true);
  });

  it("returns err on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const { validateApiKey } = await import("../../src/providers/validate.js");
    const result = await validateApiKey("anthropic", "sk-ant-test", "https://api.anthropic.com");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("ECONNREFUSED");
    }
  });

  it("validates Ollama without API key", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    const { validateApiKey } = await import("../../src/providers/validate.js");
    const result = await validateApiKey("ollama", "", "http://localhost:11434");
    expect(result.isOk()).toBe(true);
  });
});
