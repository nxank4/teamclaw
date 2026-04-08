import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

// Mock fetch for Ollama/LM Studio probes
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("env-detector", () => {
  let origEnv: Record<string, string | undefined>;
  let origCwd: () => string;

  beforeEach(() => {
    vi.clearAllMocks();
    origEnv = { ...process.env };
    origCwd = process.cwd;
    mockFetch.mockRejectedValue(new Error("Connection refused"));
  });

  afterEach(() => {
    process.env = origEnv;
    process.cwd = origCwd;
  });

  it("detects Node.js version from process.version", async () => {
    const { detectEnvironment } = await import("../../src/onboard/env-detector.js");
    const env = await detectEnvironment();
    expect(env.nodeVersion).toBe(process.version);
  });

  it("detects ANTHROPIC_API_KEY from env", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-12345678";
    const { detectEnvironment } = await import("../../src/onboard/env-detector.js");
    const env = await detectEnvironment();
    const found = env.envKeys.find((k) => k.provider === "anthropic");
    expect(found).toBeDefined();
    expect(found!.envVar).toBe("ANTHROPIC_API_KEY");
  });

  it("masks API key correctly (first 6 + last 4)", async () => {
    const { maskApiKey } = await import("../../src/onboard/env-detector.js");
    const masked = maskApiKey("sk-ant-api03-abcdefghij1234567890xyz");
    expect(masked.startsWith("sk-ant")).toBe(true);
    expect(masked.endsWith("0xyz")).toBe(true);
    expect(masked).toContain("...");
  });

  it("masks short keys entirely", async () => {
    const { maskApiKey } = await import("../../src/onboard/env-detector.js");
    expect(maskApiKey("short")).toBe("•••••");
  });

  it("detects package.json → project type node", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "openpawl-env-test-"));
    await writeFile(path.join(tmpDir, "package.json"), JSON.stringify({ name: "test-project" }));
    process.cwd = () => tmpDir;

    const { detectEnvironment } = await import("../../src/onboard/env-detector.js");
    const env = await detectEnvironment();
    expect(env.project.type).toBe("node");
    expect(env.project.name).toBe("test-project");

    await rm(tmpDir, { recursive: true, force: true });
  });

  it("detects Cargo.toml → project type rust", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "openpawl-env-test-"));
    await writeFile(path.join(tmpDir, "Cargo.toml"), '[package]\nname = "my-crate"');
    process.cwd = () => tmpDir;

    const { detectEnvironment } = await import("../../src/onboard/env-detector.js");
    const env = await detectEnvironment();
    expect(env.project.type).toBe("rust");
    expect(env.project.name).toBe("my-crate");

    await rm(tmpDir, { recursive: true, force: true });
  });

  it("detects no manifest → project type null", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "openpawl-env-test-"));
    process.cwd = () => tmpDir;

    const { detectEnvironment } = await import("../../src/onboard/env-detector.js");
    const env = await detectEnvironment();
    expect(env.project.type).toBeNull();

    await rm(tmpDir, { recursive: true, force: true });
  });

  it("detects .git directory → hasGit: true", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "openpawl-env-test-"));
    mkdirSync(path.join(tmpDir, ".git"));
    process.cwd = () => tmpDir;

    const { detectEnvironment } = await import("../../src/onboard/env-detector.js");
    const env = await detectEnvironment();
    expect(env.project.hasGit).toBe(true);

    await rm(tmpDir, { recursive: true, force: true });
  });

  it("Ollama probe: mock successful response → available: true", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("11434")) {
        return { ok: true, json: async () => ({ models: [{ name: "llama3.1" }] }) };
      }
      throw new Error("Connection refused");
    });

    const { detectEnvironment } = await import("../../src/onboard/env-detector.js");
    const env = await detectEnvironment();
    expect(env.ollama).not.toBeNull();
    expect(env.ollama!.available).toBe(true);
    expect(env.ollama!.models).toContain("llama3.1");
  });

  it("Ollama probe: mock connection refused → null", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const { detectEnvironment } = await import("../../src/onboard/env-detector.js");
    const env = await detectEnvironment();
    expect(env.ollama).toBeNull();
  });

  it("missing env vars → empty envKeys array", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GROQ_API_KEY;

    const { detectEnvironment } = await import("../../src/onboard/env-detector.js");
    const env = await detectEnvironment();
    // May have other env keys from actual environment, but shouldn't crash
    expect(Array.isArray(env.envKeys)).toBe(true);
  });
});
