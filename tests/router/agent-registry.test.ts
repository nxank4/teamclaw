import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { AgentRegistry } from "../../src/router/agent-registry.js";

describe("AgentRegistry", () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  it("registers built-in agents on construction", () => {
    const all = registry.getAll();
    expect(all.length).toBeGreaterThanOrEqual(7);
    expect(registry.has("coder")).toBe(true);
    expect(registry.has("reviewer")).toBe(true);
    expect(registry.has("planner")).toBe(true);
    expect(registry.has("tester")).toBe(true);
    expect(registry.has("debugger")).toBe(true);
    expect(registry.has("researcher")).toBe(true);
    expect(registry.has("assistant")).toBe(true);
  });

  it("get() returns agent by ID", () => {
    const coder = registry.get("coder");
    expect(coder).toBeDefined();
    expect(coder!.id).toBe("coder");
    expect(coder!.name).toBe("Coder");
  });

  it("get() returns agent by alias", () => {
    const coder = registry.get("code");
    expect(coder).toBeDefined();
    expect(coder!.id).toBe("coder");

    const reviewer = registry.get("review");
    expect(reviewer).toBeDefined();
    expect(reviewer!.id).toBe("reviewer");
  });

  it("findByIntent() returns correct agents for each category", () => {
    expect(registry.findByIntent("code_write").map((a) => a.id)).toContain("coder");
    expect(registry.findByIntent("code_review").map((a) => a.id)).toContain("reviewer");
    expect(registry.findByIntent("code_debug").map((a) => a.id)).toContain("debugger");
    expect(registry.findByIntent("test_write").map((a) => a.id)).toContain("tester");
    expect(registry.findByIntent("plan").map((a) => a.id)).toContain("planner");
    expect(registry.findByIntent("research").map((a) => a.id)).toContain("researcher");
    expect(registry.findByIntent("conversation").map((a) => a.id)).toContain("assistant");
    expect(registry.findByIntent("config")).toHaveLength(0);
  });

  it("findByCapability() matches agent capabilities", () => {
    const coders = registry.findByCapability("code_write");
    expect(coders.some((a) => a.id === "coder")).toBe(true);

    const reviewers = registry.findByCapability("code_review");
    expect(reviewers.some((a) => a.id === "reviewer")).toBe(true);
  });

  it("register() rejects duplicate IDs", () => {
    const result = registry.register({
      id: "coder",
      name: "Duplicate Coder",
      description: "test",
      capabilities: [],
      defaultTools: [],
      modelTier: "fast",
      systemPrompt: "",
      canCollaborate: false,
      maxConcurrent: 1,
    });
    expect(result.isErr()).toBe(true);
  });

  it("has() returns true for IDs and aliases", () => {
    expect(registry.has("coder")).toBe(true);
    expect(registry.has("code")).toBe(true);
    expect(registry.has("review")).toBe(true);
    expect(registry.has("nonexistent")).toBe(false);
  });

  it("getIds() returns all agent IDs", () => {
    const ids = registry.getIds();
    expect(ids).toContain("coder");
    expect(ids).toContain("assistant");
    expect(ids.length).toBeGreaterThanOrEqual(7);
  });

  it("addAlias() registers custom alias", () => {
    registry.addAlias("dev", "coder");
    expect(registry.get("dev")?.id).toBe("coder");
  });

  describe("loadUserAgents", () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await mkdtemp(path.join(os.tmpdir(), "openpawl-registry-test-"));
    });

    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true });
    });

    it("loads valid JSON files", async () => {
      const agent = {
        id: "custom-coder",
        name: "Custom Coder",
        description: "A custom coder agent",
        capabilities: ["code_write"],
        defaultTools: ["file_read"],
        modelTier: "fast",
        systemPrompt: "You are a custom coder",
        canCollaborate: true,
        maxConcurrent: 1,
      };
      await writeFile(path.join(tmpDir, "custom-coder.json"), JSON.stringify(agent), "utf-8");

      const result = await registry.loadUserAgents(tmpDir);
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(1);
      expect(registry.get("custom-coder")?.name).toBe("Custom Coder");
    });

    it("skips invalid files with warning", async () => {
      await writeFile(path.join(tmpDir, "bad.json"), "invalid json{{{", "utf-8");

      const result = await registry.loadUserAgents(tmpDir);
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(0);
    });

    it("agent with extends merges with base agent", async () => {
      const agent = {
        id: "senior-coder",
        name: "Senior Coder",
        extends: "coder",
        description: "Senior-level coder",
        modelTier: "primary",
      };
      await writeFile(path.join(tmpDir, "senior.json"), JSON.stringify(agent), "utf-8");

      await registry.loadUserAgents(tmpDir);
      const loaded = registry.get("senior-coder");
      expect(loaded).toBeDefined();
      expect(loaded!.name).toBe("Senior Coder");
      // Inherits capabilities from coder
      expect(loaded!.capabilities).toContain("code_write");
      expect(loaded!.defaultTools).toContain("file_read");
    });

    it("returns ok(0) for non-existent directory", async () => {
      const result = await registry.loadUserAgents("/tmp/nonexistent-dir-" + Date.now());
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(0);
    });
  });
});
