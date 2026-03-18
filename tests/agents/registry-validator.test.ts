import { describe, it, expect } from "vitest";
import { validateAgentDefinition } from "@/agents/registry/validator.js";

const validDef = {
  role: "code-reviewer",
  displayName: "Code Reviewer",
  description: "Reviews code for quality",
  taskTypes: ["review"],
  systemPrompt: "You are a code reviewer.",
};

describe("validateAgentDefinition", () => {
  it("accepts valid definition", () => {
    const result = validateAgentDefinition(validDef);
    expect(result.success).toBe(true);
    expect(result.data?.role).toBe("code-reviewer");
  });

  it("rejects non-kebab-case role", () => {
    const result = validateAgentDefinition({ ...validDef, role: "Code_Reviewer" });
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain("kebab-case");
  });

  it("rejects reserved built-in roles", () => {
    const result = validateAgentDefinition({ ...validDef, role: "coordinator" });
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain("reserved");
  });

  it("rejects role templates that collide", () => {
    const result = validateAgentDefinition({ ...validDef, role: "software-engineer" });
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain("collides");
  });

  it("rejects missing displayName", () => {
    const result = validateAgentDefinition({ ...validDef, displayName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects empty taskTypes", () => {
    const result = validateAgentDefinition({ ...validDef, taskTypes: [] });
    expect(result.success).toBe(false);
  });

  it("accepts optional fields", () => {
    const result = validateAgentDefinition({
      ...validDef,
      confidenceConfig: { minConfidence: 0.6, flags: ["custom-flag"] },
      compositionRules: {
        includeKeywords: ["review"],
        excludeKeywords: ["trivial"],
        required: false,
      },
      metadata: { version: "1.0" },
    });
    expect(result.success).toBe(true);
    expect(result.data?.confidenceConfig?.minConfidence).toBe(0.6);
  });

  it("rejects invalid minConfidence range", () => {
    const result = validateAgentDefinition({
      ...validDef,
      confidenceConfig: { minConfidence: 2.0 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-object input", () => {
    const result = validateAgentDefinition("not an object");
    expect(result.success).toBe(false);
  });

  it("accepts branded definitions", () => {
    const result = validateAgentDefinition({ ...validDef, __teamclaw_agent: true });
    expect(result.success).toBe(true);
  });
});
