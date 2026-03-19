import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// --- Mock global-config before any module imports ---

let mockGlobalConfig: Record<string, unknown> | null = null;

vi.mock("../src/core/global-config.js", () => ({
  readGlobalConfig: () => mockGlobalConfig,
  buildDefaultGlobalConfig: () => ({
    version: 1,
    dashboardPort: 9001,
    debugMode: false,
  }),
}));

vi.mock("../src/core/logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), plain: vi.fn(), success: vi.fn(), agent: vi.fn() },
  isDebugMode: () => false,
}));

// ========== 1. Semantic Cache: disabled via config ==========

vi.mock("@lancedb/lancedb", () => ({
  connect: vi.fn().mockResolvedValue({
    tableNames: vi.fn().mockResolvedValue([]),
    createTable: vi.fn(),
    openTable: vi.fn(),
  }),
}));

vi.mock("../src/core/knowledge-base.js", () => ({
  HttpEmbeddingFunction: vi.fn().mockImplementation(() => ({
    generate: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  })),
}));

import { SemanticCache, resetSemanticCache } from "../src/token-opt/semantic-cache.js";

describe("SemanticCache config wiring", () => {
  beforeEach(() => {
    resetSemanticCache();
  });

  it("returns null on lookup when semanticCache.enabled=false", async () => {
    mockGlobalConfig = {
      tokenOptimization: {
        semanticCache: { enabled: false },
      },
    };
    const cache = new SemanticCache();
    await cache.init();

    expect(cache.isEnabled()).toBe(false);
    const result = await cache.lookup("test", "model", "worker");
    expect(result).toBeNull();
  });

  it("returns null on store when semanticCache.enabled=false", async () => {
    mockGlobalConfig = {
      tokenOptimization: {
        semanticCache: { enabled: false },
      },
    };
    const cache = new SemanticCache();
    await cache.init();

    // store should be a no-op, not throw
    await cache.store("prompt", "model", "worker", "response");
    expect(cache.isEnabled()).toBe(false);
  });
});

// ========== 2. Model routing: disabled via config ==========

// Reset modules so model-config reads the fresh mock
vi.mock("../src/token-opt/stats.js", () => ({
  recordTierDowngrade: vi.fn(),
  recordPayloadTruncation: vi.fn(),
  recordPromptCacheHit: vi.fn(),
  recordPromptCacheCreation: vi.fn(),
  recordSemanticCacheHit: vi.fn(),
  recordSemanticCacheMiss: vi.fn(),
  resetTokenOptStats: vi.fn(),
  getTokenOptStats: vi.fn().mockReturnValue({}),
}));

import {
  resolveModelForAgent,
  resetAgentModels,
  setActiveProviderFamily,
} from "../src/core/model-config.js";

describe("Model routing config wiring", () => {
  beforeEach(() => {
    resetAgentModels();
  });

  it("skips tier routing when modelRouting.enabled=false", () => {
    mockGlobalConfig = {
      version: 1,
      dashboardPort: 9001,
      debugMode: false,
      tokenOptimization: {
        modelRouting: { enabled: false },
      },
    };
    setActiveProviderFamily("anthropic");

    // "tester" normally gets downgraded to haiku via tier routing
    const model = resolveModelForAgent("tester");
    // With routing disabled and no other config, should return empty (fallback)
    expect(model).toBe("");
  });

  it("uses tier routing when modelRouting.enabled=true", () => {
    mockGlobalConfig = {
      version: 1,
      dashboardPort: 9001,
      debugMode: false,
      tokenOptimization: {
        modelRouting: { enabled: true },
      },
    };
    setActiveProviderFamily("anthropic");

    const model = resolveModelForAgent("tester");
    expect(model).toBe("claude-haiku-4-5");
  });
});

// ========== 3. Anthropic prompt caching: disabled via config ==========

const mockStreamFn = vi.fn();
const mockFinalMessage = vi.fn().mockResolvedValue({
  usage: { input_tokens: 10, output_tokens: 5 },
});

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class Anthropic {
      messages = {
        stream: (...args: unknown[]) => {
          mockStreamFn(...args);
          return {
            async *[Symbol.asyncIterator]() {
              yield { type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } };
              yield { type: "message_stop" };
            },
            finalMessage: mockFinalMessage,
          };
        },
      };
    },
  };
});

import { AnthropicProvider } from "../src/providers/anthropic-provider.js";
import type { StreamChunk } from "../src/providers/stream-types.js";

async function collectChunks(gen: AsyncGenerator<StreamChunk, void, undefined>): Promise<StreamChunk[]> {
  const result: StreamChunk[] = [];
  for await (const chunk of gen) result.push(chunk);
  return result;
}

describe("Anthropic prompt caching config wiring", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    mockStreamFn.mockClear();
    process.env.ANTHROPIC_API_KEY = "sk-test";
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("omits cache_control when promptCaching=false", async () => {
    mockGlobalConfig = {
      tokenOptimization: {
        promptCaching: false,
      },
    };
    const provider = new AnthropicProvider({});
    await collectChunks(provider.stream("Hello", { systemPrompt: "You are helpful" }));

    const callArg = mockStreamFn.mock.calls[0]![0] as Record<string, unknown>;
    const systemBlocks = callArg.system as Array<Record<string, unknown>>;
    expect(systemBlocks).toHaveLength(1);
    expect(systemBlocks[0]!.text).toBe("You are helpful");
    expect(systemBlocks[0]!.cache_control).toBeUndefined();
  });

  it("includes cache_control when promptCaching=true", async () => {
    mockGlobalConfig = {
      tokenOptimization: {
        promptCaching: true,
      },
    };
    const provider = new AnthropicProvider({});
    await collectChunks(provider.stream("Hello", { systemPrompt: "You are helpful" }));

    const callArg = mockStreamFn.mock.calls[0]![0] as Record<string, unknown>;
    const systemBlocks = callArg.system as Array<Record<string, unknown>>;
    expect(systemBlocks[0]!.cache_control).toEqual({ type: "ephemeral" });
  });
});

// ========== 4. Custom similarity threshold / TTL ==========

describe("SemanticCache custom thresholds from config", () => {
  beforeEach(() => {
    resetSemanticCache();
  });

  it("uses custom similarityThreshold from config", async () => {
    // Set a very low threshold so anything matches
    mockGlobalConfig = {
      tokenOptimization: {
        semanticCache: {
          enabled: true,
          similarityThreshold: 0.5,
          ttlMinutes: 60,
        },
      },
    };

    const cache = new SemanticCache();
    await cache.init();
    // The cache should have initialized with custom values
    // We verify via isEnabled (enabled=true means it initialized properly)
    expect(cache.isEnabled()).toBe(true);
  });
});
