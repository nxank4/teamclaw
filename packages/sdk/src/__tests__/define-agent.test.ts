import { describe, it, expect } from "vitest";
import { defineAgent, isAgentDefinition } from "../define-agent.js";

const validDef = {
  role: "code-reviewer",
  displayName: "Code Reviewer",
  description: "Reviews code for quality and best practices",
  taskTypes: ["review", "audit"],
  systemPrompt: "You are a code reviewer. Review the given code carefully.",
};

describe("defineAgent", () => {
  it("returns a branded definition for valid input", () => {
    const result = defineAgent(validDef);
    expect(result.__openpawl_agent).toBe(true);
    expect(result.role).toBe("code-reviewer");
    expect(result.displayName).toBe("Code Reviewer");
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("rejects empty role", () => {
    expect(() => defineAgent({ ...validDef, role: "" })).toThrow("role is required");
  });

  it("rejects non-kebab-case role", () => {
    expect(() => defineAgent({ ...validDef, role: "Code_Reviewer" })).toThrow("kebab-case");
    expect(() => defineAgent({ ...validDef, role: "codeReviewer" })).toThrow("kebab-case");
    expect(() => defineAgent({ ...validDef, role: "CODE-REVIEWER" })).toThrow("kebab-case");
  });

  it("accepts valid kebab-case roles", () => {
    expect(() => defineAgent({ ...validDef, role: "code-reviewer" })).not.toThrow();
    expect(() => defineAgent({ ...validDef, role: "reviewer" })).not.toThrow();
    expect(() => defineAgent({ ...validDef, role: "a1-b2-c3" })).not.toThrow();
  });

  it("rejects missing displayName", () => {
    expect(() => defineAgent({ ...validDef, displayName: "" })).toThrow("displayName");
  });

  it("rejects missing description", () => {
    expect(() => defineAgent({ ...validDef, description: "" })).toThrow("description");
  });

  it("rejects missing systemPrompt", () => {
    expect(() => defineAgent({ ...validDef, systemPrompt: "" })).toThrow("systemPrompt");
  });

  it("rejects empty taskTypes", () => {
    expect(() => defineAgent({ ...validDef, taskTypes: [] })).toThrow("taskTypes");
  });

  it("rejects taskTypes with empty strings", () => {
    expect(() => defineAgent({ ...validDef, taskTypes: ["review", ""] })).toThrow("non-empty string");
  });

  it("validates confidenceConfig.minConfidence range", () => {
    expect(() =>
      defineAgent({ ...validDef, confidenceConfig: { minConfidence: 1.5 } }),
    ).toThrow("between 0 and 1");
    expect(() =>
      defineAgent({ ...validDef, confidenceConfig: { minConfidence: -0.1 } }),
    ).toThrow("between 0 and 1");
    expect(() =>
      defineAgent({ ...validDef, confidenceConfig: { minConfidence: 0.7 } }),
    ).not.toThrow();
  });

  it("accepts valid compositionRules", () => {
    const result = defineAgent({
      ...validDef,
      compositionRules: {
        includeKeywords: ["review", "audit"],
        excludeKeywords: ["simple"],
        required: false,
      },
    });
    expect(result.compositionRules?.includeKeywords).toEqual(["review", "audit"]);
  });

  it("accepts hooks", () => {
    const result = defineAgent({
      ...validDef,
      hooks: {
        beforeTask: async (task) => task,
        afterTask: async (result) => result,
        onError: async () => {},
      },
    });
    expect(result.hooks?.beforeTask).toBeDefined();
  });

  it("accepts metadata", () => {
    const result = defineAgent({
      ...validDef,
      metadata: { version: "1.0", author: "test" },
    });
    expect(result.metadata?.version).toBe("1.0");
  });
});

describe("isAgentDefinition", () => {
  it("returns true for branded definitions", () => {
    const def = defineAgent(validDef);
    expect(isAgentDefinition(def)).toBe(true);
  });

  it("returns false for plain objects", () => {
    expect(isAgentDefinition(validDef)).toBe(false);
    expect(isAgentDefinition(null)).toBe(false);
    expect(isAgentDefinition("string")).toBe(false);
  });
});
