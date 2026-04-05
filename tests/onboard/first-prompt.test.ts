import { describe, it, expect } from "vitest";
import { generateFirstPrompts } from "../../src/onboard/first-prompt.js";
import type { DetectedEnvironment } from "../../src/onboard/types.js";

function makeEnv(overrides: Partial<DetectedEnvironment["project"]> = {}): DetectedEnvironment {
  return {
    nodeVersion: "v22.0.0",
    packageManager: null,
    shell: "bash",
    terminal: "xterm-256color",
    ollama: null,
    lmStudio: null,
    envKeys: [],
    project: {
      type: null,
      name: null,
      path: "/tmp/test",
      hasGit: false,
      ...overrides,
    },
    hasExistingConfig: false,
    existingConfigValid: false,
  };
}

describe("first-prompt", () => {
  it("returns exactly 4 suggestions", () => {
    const suggestions = generateFirstPrompts(makeEnv());
    expect(suggestions).toHaveLength(4);
  });

  it("Node.js project gets Node-specific suggestions", () => {
    const suggestions = generateFirstPrompts(makeEnv({ type: "node" }));
    expect(suggestions.some((s) => s.text.toLowerCase().includes("api") || s.text.toLowerCase().includes("test"))).toBe(true);
  });

  it("Rust project gets Rust-specific suggestions", () => {
    const suggestions = generateFirstPrompts(makeEnv({ type: "rust" }));
    expect(suggestions.some((s) => s.text.toLowerCase().includes("thiserror") || s.text.toLowerCase().includes("unsafe"))).toBe(true);
  });

  it("no project gets general suggestions", () => {
    const suggestions = generateFirstPrompts(makeEnv({ type: null }));
    expect(suggestions.some((s) => s.text.toLowerCase().includes("rest api") || s.text.toLowerCase().includes("cli tool"))).toBe(true);
  });

  it("all suggestions under 60 character limit", () => {
    for (const projectType of ["node", "rust", "python", "go", null] as const) {
      const suggestions = generateFirstPrompts(makeEnv({ type: projectType }));
      for (const s of suggestions) {
        expect(s.text.length).toBeLessThanOrEqual(60);
      }
    }
  });

  it("all descriptions under 40 character limit", () => {
    for (const projectType of ["node", "rust", "python", "go", null] as const) {
      const suggestions = generateFirstPrompts(makeEnv({ type: projectType }));
      for (const s of suggestions) {
        expect(s.description.length).toBeLessThanOrEqual(40);
      }
    }
  });

  it("each suggestion has valid category", () => {
    const validCategories = new Set(["explore", "create", "fix", "learn"]);
    const suggestions = generateFirstPrompts(makeEnv());
    for (const s of suggestions) {
      expect(validCategories.has(s.category)).toBe(true);
    }
  });
});
