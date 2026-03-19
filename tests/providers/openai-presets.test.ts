import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAICompatibleProvider, type OpenAIPreset } from "../../src/providers/openai-compatible-provider.js";

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(public config: Record<string, unknown>) {}
    chat = { completions: { create: vi.fn().mockReturnValue({ [Symbol.asyncIterator]: async function* () { yield { choices: [{ delta: { content: "ok" } }] }; yield { choices: [{}], usage: { prompt_tokens: 10, completion_tokens: 5 } }; } }) } };
    models = { list: vi.fn().mockResolvedValue({ data: [] }) };
  },
}));

const NEW_PRESETS: OpenAIPreset[] = [
  "gemini", "grok", "mistral", "cerebras", "together",
  "fireworks", "perplexity", "moonshot", "zai", "minimax",
  "cohere", "opencode-zen", "opencode-go", "azure", "lmstudio",
];

describe("OpenAI-compatible new presets", () => {
  beforeEach(() => { vi.unstubAllEnvs(); });

  for (const preset of NEW_PRESETS) {
    it(`creates provider for preset: ${preset}`, () => {
      const provider = new OpenAICompatibleProvider({ preset, apiKey: "test-key" });
      expect(provider.name).toBe(preset);
      expect(provider.isAvailable()).toBe(true);
    });
  }

  it("lmstudio preset does not require API key", () => {
    const provider = new OpenAICompatibleProvider({ preset: "lmstudio" });
    expect(provider.isAvailable()).toBe(true);
  });

  it("gemini preset checks GOOGLE_API_KEY env var", () => {
    vi.stubEnv("GOOGLE_API_KEY", "test-gemini-key");
    const provider = new OpenAICompatibleProvider({ preset: "gemini" });
    expect(provider.isAvailable()).toBe(true);
  });

  it("together preset checks TOGETHER_API_KEY env var", () => {
    vi.stubEnv("TOGETHER_API_KEY", "test-together-key");
    const provider = new OpenAICompatibleProvider({ preset: "together" });
    expect(provider.isAvailable()).toBe(true);
  });
});
