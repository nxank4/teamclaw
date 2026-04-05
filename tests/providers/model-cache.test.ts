import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm, readFile } from "node:fs/promises";

// Mock the cache path to use a temp directory
let tempDir: string;

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => tempDir,
  };
});

describe("model-cache", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "openpawl-cache-test-"));
    // Re-import to pick up new tempDir
    vi.resetModules();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns null when cache does not exist", async () => {
    const { getCachedModels } = await import("../../src/providers/model-cache.js");
    const result = await getCachedModels("anthropic");
    expect(result).toBeNull();
  });

  it("writes and reads back correctly", async () => {
    const { getCachedModels, setCachedModels } = await import("../../src/providers/model-cache.js");

    await setCachedModels("anthropic", ["claude-opus-4-6", "claude-sonnet-4-6"]);
    const result = await getCachedModels("anthropic");
    expect(result).toEqual(["claude-opus-4-6", "claude-sonnet-4-6"]);
  });

  it("returns null when cache expired", async () => {
    const { getCachedModels } = await import("../../src/providers/model-cache.js");
    const { writeFile, mkdir } = await import("node:fs/promises");

    const cachePath = join(tempDir, ".openpawl", "model-cache.json");
    await mkdir(join(tempDir, ".openpawl"), { recursive: true });

    // Write expired cache (25 hours ago)
    const expired = {
      groq: {
        fetchedAt: Date.now() - 25 * 60 * 60 * 1000,
        models: ["llama-3.3-70b"],
      },
    };
    await writeFile(cachePath, JSON.stringify(expired));

    const result = await getCachedModels("groq");
    expect(result).toBeNull();
  });

  it("returns models when cache is fresh", async () => {
    const { getCachedModels } = await import("../../src/providers/model-cache.js");
    const { writeFile, mkdir } = await import("node:fs/promises");

    const cachePath = join(tempDir, ".openpawl", "model-cache.json");
    await mkdir(join(tempDir, ".openpawl"), { recursive: true });

    const fresh = {
      openai: {
        fetchedAt: Date.now() - 1000, // 1 second ago
        models: ["gpt-5.4", "gpt-5.4-mini"],
      },
    };
    await writeFile(cachePath, JSON.stringify(fresh));

    const result = await getCachedModels("openai");
    expect(result).toEqual(["gpt-5.4", "gpt-5.4-mini"]);
  });

  it("skips cache for local providers", async () => {
    const { getCachedModels, setCachedModels } = await import("../../src/providers/model-cache.js");

    await setCachedModels("ollama", ["llama3"]);
    const result = await getCachedModels("ollama");
    expect(result).toBeNull();
  });

  it("clears specific provider cache", async () => {
    const { getCachedModels, setCachedModels, clearCache } = await import("../../src/providers/model-cache.js");

    await setCachedModels("anthropic", ["claude-opus-4-6"]);
    await setCachedModels("openai", ["gpt-5.4"]);

    await clearCache("anthropic");

    expect(await getCachedModels("anthropic")).toBeNull();
    expect(await getCachedModels("openai")).toEqual(["gpt-5.4"]);
  });

  it("clears all cache", async () => {
    const { getCachedModels, setCachedModels, clearCache } = await import("../../src/providers/model-cache.js");

    await setCachedModels("anthropic", ["claude-opus-4-6"]);
    await setCachedModels("openai", ["gpt-5.4"]);

    await clearCache();

    expect(await getCachedModels("anthropic")).toBeNull();
    expect(await getCachedModels("openai")).toBeNull();
  });
});
