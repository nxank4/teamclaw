import { describe, expect, it } from "bun:test";

import {
  classify,
  DEFAULT_COMPLEXITY_CONFIG,
} from "../../src/spec/complexity.js";

describe("classify", () => {
  it("classifies a short, plain prompt as trivial", () => {
    const result = classify("what is 2 + 2?");
    expect(result.class).toBe("trivial");
    expect(result.reasons).toEqual([]);
  });

  it("flags @spec prefix as complex", () => {
    const result = classify("@spec design a session resume flow");
    expect(result.class).toBe("complex");
    expect(result.reasons.some((r) => r.includes("@spec"))).toBe(true);
  });

  it("flags a long prompt by token count", () => {
    const long = "lorem ipsum ".repeat(200); // ~2400 chars → ~600 tokens
    const result = classify(long, DEFAULT_COMPLEXITY_CONFIG);
    expect(result.class).toBe("complex");
    expect(result.reasons.some((r) => r.startsWith("tokens "))).toBe(true);
  });

  it("flags 3+ distinct file paths as complex", () => {
    const result = classify(
      "update src/auth/oauth.ts, src/auth/index.ts, and tests/auth/oauth.test.ts",
    );
    expect(result.class).toBe("complex");
    expect(result.reasons.some((r) => r.startsWith("file_mentions"))).toBe(true);
  });

  it("does not flag 2 file paths (boundary)", () => {
    const result = classify("update src/foo.ts and src/bar.ts");
    expect(result.reasons.some((r) => r.startsWith("file_mentions"))).toBe(false);
  });

  it("flags a trigger word at word boundary", () => {
    const result = classify("refactor the parser");
    expect(result.class).toBe("complex");
    expect(result.reasons.some((r) => r === "trigger_word refactor")).toBe(true);
  });

  it("flags trigger words case-insensitively", () => {
    expect(classify("Migrate to new schema").class).toBe("complex");
    expect(classify("IMPLEMENT auth").class).toBe("complex");
  });

  it("does not flag a trigger word inside a larger token (no word-boundary)", () => {
    // "rebuild" contains "build" but the word-boundary regex should not match.
    const result = classify("how does prebuild rebuild build");
    // "build" appears as a standalone word at the end → DOES match.
    // Test the no-match case with no standalone trigger:
    const noTrigger = classify("how does prebuild work in webpack");
    expect(noTrigger.reasons.some((r) => r.startsWith("trigger_word"))).toBe(false);
    void result;
  });

  it("respects a custom config", () => {
    const tight = classify("hello world", { tokens: 1, fileMentions: 99 });
    expect(tight.class).toBe("complex");
    expect(tight.reasons.some((r) => r.startsWith("tokens "))).toBe(true);
  });

  it("collects multiple reasons when several rules fire", () => {
    const result = classify(
      "refactor src/a.ts, src/b.ts, src/c.ts to remove the legacy auth path",
    );
    expect(result.class).toBe("complex");
    expect(result.reasons.length).toBeGreaterThan(1);
  });
});
