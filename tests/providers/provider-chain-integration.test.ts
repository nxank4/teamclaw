import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(public config: Record<string, unknown>) {}
    chat = {
      completions: {
        create: vi.fn().mockReturnValue({
          [Symbol.asyncIterator]: async function* () {
            yield { choices: [{ delta: { content: "test" } }] };
            yield { choices: [{}], usage: { prompt_tokens: 10, completion_tokens: 5 } };
          },
        }),
      },
    };
    models = { list: vi.fn().mockResolvedValue({ data: [] }) };
  },
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    constructor(public config: Record<string, unknown>) {}
    messages = {
      stream: vi.fn().mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { type: "content_block_delta", delta: { type: "text_delta", text: "test" } };
          yield { type: "message_stop" };
        },
        finalMessage: vi.fn().mockResolvedValue({ usage: { input_tokens: 10, output_tokens: 5 } }),
      }),
    };
  },
}));

vi.mock("../../src/core/logger.js", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// Mock dedicated providers to avoid real network calls
vi.mock("../../src/providers/copilot-provider.js", () => ({
  CopilotProvider: vi.fn().mockImplementation(() => ({
    name: "copilot",
    isAvailable: () => false,
    setAvailable: vi.fn(),
    healthCheck: async () => false,
    stream: async function* () {},
  })),
}));

vi.mock("../../src/providers/chatgpt-oauth-provider.js", () => ({
  ChatGPTOAuthProvider: vi.fn().mockImplementation(() => ({
    name: "chatgpt",
    isAvailable: () => false,
    setAvailable: vi.fn(),
    healthCheck: async () => false,
    stream: async function* () {},
  })),
}));

vi.mock("../../src/providers/bedrock-provider.js", () => ({
  BedrockProvider: vi.fn().mockImplementation(() => ({
    name: "bedrock",
    isAvailable: () => false,
    setAvailable: vi.fn(),
    healthCheck: async () => false,
    stream: async function* () {},
  })),
}));

vi.mock("../../src/providers/vertex-provider.js", () => ({
  VertexProvider: vi.fn().mockImplementation(() => ({
    name: "vertex",
    isAvailable: () => false,
    setAvailable: vi.fn(),
    healthCheck: async () => false,
    stream: async function* () {},
  })),
}));

// Mock CredentialStore to avoid real keychain access in tests
vi.mock("../../src/credentials/credential-store.js", () => ({
  CredentialStore: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue({ isOk: () => true }),
    resolveApiKey: vi.fn().mockResolvedValue(null),
  })),
}));

// Mock detectProviders to avoid real network probes in tests
vi.mock("../../src/providers/detect.js", () => ({
  detectProviders: vi.fn().mockResolvedValue([]),
}));

import { createProviderChain } from "../../src/providers/provider-factory.js";
import { ProviderManager } from "../../src/providers/provider-manager.js";
import type { ProviderConfigEntry } from "../../src/core/global-config.js";
import { detectProviders } from "../../src/providers/detect.js";

describe("provider chain integration", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(detectProviders).mockResolvedValue([]);
  });

  it("creates chain from mixed provider config", async () => {
    const entries: ProviderConfigEntry[] = [
      { type: "anthropic", apiKey: "sk-ant-test" },
      { type: "grok", apiKey: "xai-test" },
      { type: "deepseek", apiKey: "sk-test" },
      { type: "ollama" },
    ];

    const chain = await createProviderChain(entries);
    expect(chain).toHaveLength(4);
    expect(chain[0]!.name).toBe("anthropic");
    expect(chain[1]!.name).toBe("grok");
    expect(chain[2]!.name).toBe("deepseek");
    expect(chain[3]!.name).toBe("ollama");
  });

  it("creates chain from new OpenAI-compatible provider types", async () => {
    const entries: ProviderConfigEntry[] = [
      { type: "gemini", apiKey: "test-key", model: "gemini-3-pro" },
      { type: "mistral", apiKey: "test-key", model: "codestral" },
      { type: "cerebras", apiKey: "test-key" },
      { type: "together", apiKey: "test-key" },
      { type: "fireworks", apiKey: "test-key" },
      { type: "perplexity", apiKey: "test-key" },
      { type: "moonshot", apiKey: "test-key" },
      { type: "zai", apiKey: "test-key" },
      { type: "minimax", apiKey: "test-key" },
      { type: "cohere", apiKey: "test-key" },
    ];

    const chain = await createProviderChain(entries);
    expect(chain).toHaveLength(10);
    expect(chain.map(p => p.name)).toEqual([
      "gemini", "mistral", "cerebras", "together", "fireworks",
      "perplexity", "moonshot", "zai", "minimax", "cohere",
    ]);
  });

  it("discovers new providers from env vars", async () => {
    vi.mocked(detectProviders).mockResolvedValue([
      { type: "grok", available: true, source: "env", envKey: "XAI_API_KEY" },
      { type: "mistral", available: true, source: "env", envKey: "MISTRAL_API_KEY" },
      { type: "cerebras", available: true, source: "env", envKey: "CEREBRAS_API_KEY" },
    ]);
    vi.stubEnv("XAI_API_KEY", "xai-test");
    vi.stubEnv("MISTRAL_API_KEY", "test-key");
    vi.stubEnv("CEREBRAS_API_KEY", "test-key");

    const chain = await createProviderChain();
    expect(chain.length).toBeGreaterThanOrEqual(3);
    const names = chain.map(p => p.name);
    expect(names).toContain("grok");
    expect(names).toContain("mistral");
    expect(names).toContain("cerebras");
  });

  it("deduplicates env var providers with same preset", async () => {
    vi.mocked(detectProviders).mockResolvedValue([
      { type: "gemini", available: true, source: "env", envKey: "GOOGLE_API_KEY" },
    ]);
    vi.stubEnv("GOOGLE_API_KEY", "key1");
    vi.stubEnv("GEMINI_API_KEY", "key2");

    const chain = await createProviderChain();
    const geminiProviders = chain.filter(p => p.name === "gemini");
    expect(geminiProviders).toHaveLength(1);
  });

  it("creates ProviderManager from chain", async () => {
    const entries: ProviderConfigEntry[] = [
      { type: "anthropic", apiKey: "sk-ant-test" },
      { type: "deepseek", apiKey: "sk-test" },
    ];

    const chain = await createProviderChain(entries);
    const manager = new ProviderManager(chain);
    expect(manager.getProviders()).toHaveLength(2);
  });

  it("filters out null providers (e.g. gemini-oauth stub)", async () => {
    const entries: ProviderConfigEntry[] = [
      { type: "gemini-oauth" },
      { type: "anthropic", apiKey: "sk-ant-test" },
    ];

    const chain = await createProviderChain(entries);
    expect(chain).toHaveLength(1);
    expect(chain[0]!.name).toBe("anthropic");
  });

  it("creates dedicated providers from config", async () => {
    const entries: ProviderConfigEntry[] = [
      { type: "copilot", githubToken: "ghu_test" },
      { type: "chatgpt", oauthToken: "test-token" },
      { type: "bedrock", accessKeyId: "AKIA", secretAccessKey: "secret" },
      { type: "vertex", projectId: "my-project" },
    ];

    const chain = await createProviderChain(entries);
    expect(chain).toHaveLength(4);
    expect(chain.map(p => p.name)).toEqual(["copilot", "chatgpt", "bedrock", "vertex"]);
  });

  it("ignores removed anthropic-sub type gracefully", async () => {
    const entries: ProviderConfigEntry[] = [
      { type: "anthropic", apiKey: "sk-ant-api03-test" },
    ];

    const chain = await createProviderChain(entries);
    expect(chain).toHaveLength(1);
    expect(chain[0]!.name).toBe("anthropic");
  });

  it("returns empty chain when no config and no env vars", async () => {
    const chain = await createProviderChain();
    expect(chain).toHaveLength(0);
  });
});
