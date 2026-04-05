import { describe, it, expect, vi } from "vitest";
import { IntentClassifier } from "../../src/router/intent-classifier.js";
import type { ClassifierLLM } from "../../src/router/intent-classifier.js";
import type { PromptIntent, AgentDefinition } from "../../src/router/router-types.js";
import { AgentRegistry } from "../../src/router/agent-registry.js";

// Mock LLM that returns structured classification
function createMockLLM(override?: Partial<PromptIntent>): ClassifierLLM {
  return {
    classify: vi.fn().mockResolvedValue({
      category: "code_write",
      confidence: 0.9,
      complexity: "simple",
      requiresTools: ["file_write"],
      suggestedAgents: ["coder"],
      reasoning: "Mock classification",
      ...override,
    }),
  };
}

describe("IntentClassifier", () => {
  const registry = new AgentRegistry();
  const agents = registry.getAll();

  it('classifies "write a login form" as code_write', async () => {
    const llm = createMockLLM({ category: "code_write", suggestedAgents: ["coder"] });
    const classifier = new IntentClassifier(llm, agents);

    const result = await classifier.classify("write a login form");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().category).toBe("code_write");
  });

  it('classifies "review the auth module" as code_review', async () => {
    const llm = createMockLLM({ category: "code_review", suggestedAgents: ["reviewer"] });
    const classifier = new IntentClassifier(llm, agents);

    const result = await classifier.classify("review the auth module");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().category).toBe("code_review");
  });

  it('classifies "fix the crash in user.ts" as code_debug', async () => {
    const llm = createMockLLM({ category: "code_debug", suggestedAgents: ["debugger"] });
    const classifier = new IntentClassifier(llm, agents);

    const result = await classifier.classify("fix the crash in user.ts");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().category).toBe("code_debug");
  });

  it('classifies "what does this function do" as code_explain', async () => {
    const llm = createMockLLM({ category: "code_explain", suggestedAgents: ["assistant"] });
    const classifier = new IntentClassifier(llm, agents);

    const result = await classifier.classify("what does this function do");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().category).toBe("code_explain");
  });

  it('classifies "hello" as conversation with trivial complexity (pattern fallback)', async () => {
    // No LLM — falls back to pattern matching
    const classifier = new IntentClassifier(null, agents);

    const result = await classifier.classify("hello");
    expect(result.isOk()).toBe(true);
    const intent = result._unsafeUnwrap();
    expect(intent.category).toBe("conversation");
    expect(intent.complexity).toBe("simple"); // pattern fallback gives "simple"
  });

  it('classifies "build a REST API with auth and tests" as multi_step', async () => {
    const llm = createMockLLM({ category: "multi_step", complexity: "complex" });
    const classifier = new IntentClassifier(llm, agents);

    const result = await classifier.classify("build a REST API with auth and tests");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().category).toBe("multi_step");
  });

  it("fast-path: slash commands bypass LLM", async () => {
    const llm = createMockLLM();
    const classifier = new IntentClassifier(llm, agents);

    const result = await classifier.classify("/help");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().category).toBe("config");
    expect(result._unsafeUnwrap().complexity).toBe("trivial");
    // LLM should NOT have been called
    expect(llm.classify).not.toHaveBeenCalled();
  });

  it("fast-path: empty prompt returns conversation/trivial", async () => {
    const llm = createMockLLM();
    const classifier = new IntentClassifier(llm, agents);

    const result = await classifier.classify("");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().category).toBe("conversation");
    expect(result._unsafeUnwrap().complexity).toBe("trivial");
    expect(llm.classify).not.toHaveBeenCalled();
  });

  it('fast-path: "yes"/"no" returns conversation/trivial', async () => {
    const llm = createMockLLM();
    const classifier = new IntentClassifier(llm, agents);

    for (const word of ["yes", "no", "y", "n", "ok"]) {
      const result = await classifier.classify(word);
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().category).toBe("conversation");
      expect(result._unsafeUnwrap().complexity).toBe("trivial");
    }
    expect(llm.classify).not.toHaveBeenCalled();
  });

  it("uses mini-tier model (verify LLM is called for complex prompts)", async () => {
    const llm = createMockLLM();
    const classifier = new IntentClassifier(llm, agents);

    await classifier.classify("implement a complete user authentication system with OAuth2");
    expect(llm.classify).toHaveBeenCalledTimes(1);
  });

  it("returns structured PromptIntent matching schema", async () => {
    const llm = createMockLLM();
    const classifier = new IntentClassifier(llm, agents);

    const result = await classifier.classify("write a function");
    expect(result.isOk()).toBe(true);
    const intent = result._unsafeUnwrap();

    // Check all required fields exist
    expect(intent).toHaveProperty("category");
    expect(intent).toHaveProperty("confidence");
    expect(intent).toHaveProperty("complexity");
    expect(intent).toHaveProperty("requiresTools");
    expect(intent).toHaveProperty("suggestedAgents");
    expect(intent).toHaveProperty("reasoning");
    expect(typeof intent.confidence).toBe("number");
    expect(Array.isArray(intent.requiresTools)).toBe(true);
  });

  it("returns err when LLM throws", async () => {
    const llm: ClassifierLLM = {
      classify: vi.fn().mockRejectedValue(new Error("LLM unavailable")),
    };
    const classifier = new IntentClassifier(llm, agents);

    const result = await classifier.classify("do something complex");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("classification_failed");
    }
  });

  it("pattern fallback works without LLM", async () => {
    const classifier = new IntentClassifier(null, agents);

    const debugResult = await classifier.classify("fix the error in auth.ts");
    expect(debugResult._unsafeUnwrap().category).toBe("code_debug");

    const writeResult = await classifier.classify("create a new helper function");
    expect(writeResult._unsafeUnwrap().category).toBe("code_write");
  });
});
