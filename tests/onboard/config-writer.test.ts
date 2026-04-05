import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

// We need to override the config dir. Since config-writer uses os.homedir(),
// we test via the actual functions but create a mock home.
import { writeInitialConfig, mergeIntoExistingConfig } from "../../src/onboard/config-writer.js";

describe("config-writer", () => {
  let tmpDir: string;
  let origHome: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "openpawl-config-test-"));
    origHome = os.homedir();
    // Override homedir for these tests
    Object.defineProperty(os, "homedir", { value: () => tmpDir, configurable: true });
  });

  afterEach(async () => {
    Object.defineProperty(os, "homedir", { value: () => origHome, configurable: true });
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("writeInitialConfig creates config directory", async () => {
    const result = await writeInitialConfig({
      provider: "anthropic",
      apiKey: "sk-test",
      model: "claude-sonnet-4-6",
      providerChain: ["anthropic"],
      additionalProviders: [],
      projectPath: "/tmp/project",
    });

    expect(result.isOk()).toBe(true);
    expect(existsSync(path.join(tmpDir, ".openpawl"))).toBe(true);
  });

  it("writeInitialConfig writes valid JSON config", async () => {
    await writeInitialConfig({
      provider: "anthropic",
      apiKey: "sk-test",
      model: "claude-sonnet-4-6",
      providerChain: ["anthropic"],
      additionalProviders: [],
      projectPath: "/tmp",
    });

    const configPath = path.join(tmpDir, ".openpawl", "config.json");
    const raw = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw);

    expect(parsed.version).toBe(1);
    expect(parsed.model).toBe("claude-sonnet-4-6");
    expect(parsed.providers).toHaveLength(1);
    expect(parsed.providers[0].type).toBe("anthropic");
    expect(parsed.providers[0].apiKey).toBe("sk-test");
  });

  it("writeInitialConfig uses atomic write", async () => {
    await writeInitialConfig({
      provider: "openai",
      apiKey: "sk-test",
      model: "gpt-4o",
      providerChain: ["openai"],
      additionalProviders: [],
      projectPath: "/tmp",
    });

    // .tmp file should not exist after completion
    expect(existsSync(path.join(tmpDir, ".openpawl", "config.json.tmp"))).toBe(false);
    // But config.json should exist
    expect(existsSync(path.join(tmpDir, ".openpawl", "config.json"))).toBe(true);
  });

  it("writeInitialConfig sets file permissions 0o600", async () => {
    if (process.platform === "win32") return;

    await writeInitialConfig({
      provider: "anthropic",
      apiKey: "sk-test",
      model: "claude-sonnet-4-6",
      providerChain: ["anthropic"],
      additionalProviders: [],
      projectPath: "/tmp",
    });

    const configPath = path.join(tmpDir, ".openpawl", "config.json");
    const stats = await stat(configPath);
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it("mergeIntoExistingConfig preserves existing session config", async () => {
    // Write initial config with session section
    const openpawlDir = path.join(tmpDir, ".openpawl");
    mkdirSync(openpawlDir, { recursive: true });
    writeFileSync(
      path.join(openpawlDir, "config.json"),
      JSON.stringify({
        version: 1,
        session: { idleTimeoutMinutes: 60 },
        router: { defaultAgent: "coder" },
        providers: [{ type: "openai", apiKey: "old-key" }],
      }),
    );

    await mergeIntoExistingConfig({
      provider: "anthropic",
      apiKey: "new-key",
      model: "claude-sonnet-4-6",
      providerChain: ["anthropic"],
      additionalProviders: [],
      projectPath: "/tmp",
    });

    const raw = await readFile(path.join(openpawlDir, "config.json"), "utf-8");
    const parsed = JSON.parse(raw);

    // Session config preserved
    expect(parsed.session?.idleTimeoutMinutes).toBe(60);
    // Router config preserved
    expect(parsed.router?.defaultAgent).toBe("coder");
    // Provider updated
    expect(parsed.providers[0].type).toBe("anthropic");
  });

  it("mergeIntoExistingConfig handles missing existing config", async () => {
    const result = await mergeIntoExistingConfig({
      provider: "anthropic",
      apiKey: "sk-test",
      model: "claude-sonnet-4-6",
      providerChain: ["anthropic"],
      additionalProviders: [],
      projectPath: "/tmp",
    });

    expect(result.isOk()).toBe(true);
  });

  it("config round-trips: write → read → matches input", async () => {
    await writeInitialConfig({
      provider: "deepseek",
      apiKey: "sk-ds-test",
      model: "deepseek-chat",
      providerChain: ["deepseek", "ollama"],
      additionalProviders: [{ provider: "ollama", baseURL: "http://localhost:11434/v1" }],
      projectPath: "/tmp",
    });

    const configPath = path.join(tmpDir, ".openpawl", "config.json");
    const raw = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw);

    expect(parsed.model).toBe("deepseek-chat");
    expect(parsed.providers).toHaveLength(2);
    expect(parsed.providers[0].type).toBe("deepseek");
    expect(parsed.providers[1].type).toBe("ollama");
    expect(parsed.providers[1].baseURL).toBe("http://localhost:11434/v1");
  });
});
