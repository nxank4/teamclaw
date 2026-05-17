import { describe, expect, it } from "bun:test";

import {
  buildSlugPrompt,
  extractSlugCandidate,
  generateSlug,
} from "../../src/spec/slug-gen.js";

describe("extractSlugCandidate", () => {
  it("accepts a clean kebab-case slug", () => {
    expect(extractSlugCandidate("refactor-auth-flow")).toBe("refactor-auth-flow");
  });

  it("lowercases and hyphenates a space-separated phrase", () => {
    expect(extractSlugCandidate("Refactor Auth Flow")).toBe("refactor-auth-flow");
  });

  it("strips wrapping backticks / quotes / asterisks", () => {
    expect(extractSlugCandidate("`refactor-auth-flow`")).toBe("refactor-auth-flow");
    expect(extractSlugCandidate('"refactor-auth-flow"')).toBe("refactor-auth-flow");
    expect(extractSlugCandidate("**refactor-auth-flow**")).toBe("refactor-auth-flow");
  });

  it("strips a leading 'Slug:' prefix the LLM sometimes adds", () => {
    expect(extractSlugCandidate("Slug: refactor-auth-flow")).toBe("refactor-auth-flow");
    expect(extractSlugCandidate("slug = refactor-auth-flow")).toBe("refactor-auth-flow");
  });

  it("uses only the first line when the LLM follows up with prose", () => {
    expect(extractSlugCandidate("refactor-auth-flow\nHope that helps!")).toBe(
      "refactor-auth-flow",
    );
  });

  it("collapses runs of hyphens and trims them at the ends", () => {
    expect(extractSlugCandidate("--refactor---auth--flow--")).toBe("refactor-auth-flow");
  });

  it("caps the result at 40 characters", () => {
    const long = Array(20).fill("word").join(" "); // 20 words
    const out = extractSlugCandidate(long);
    expect(out).not.toBeNull();
    expect((out ?? "").length).toBeLessThanOrEqual(40);
  });

  it("returns null when the candidate is too short", () => {
    expect(extractSlugCandidate("ab")).toBeNull();
  });

  it("returns null when the candidate starts with a digit", () => {
    expect(extractSlugCandidate("123-features")).toBeNull();
  });

  it("returns null for an empty response", () => {
    expect(extractSlugCandidate("")).toBeNull();
    expect(extractSlugCandidate("   \n  ")).toBeNull();
  });

  it("returns null when nothing alphabetic survives normalization", () => {
    expect(extractSlugCandidate("!!! @@@ ###")).toBeNull();
  });
});

describe("buildSlugPrompt", () => {
  it("embeds the user prompt inside the instructions", () => {
    const p = buildSlugPrompt("refactor the auth module");
    expect(p).toContain("refactor the auth module");
    expect(p).toContain("kebab-case");
    expect(p).toContain("40 characters max");
  });
});

describe("generateSlug", () => {
  it("uses the LLM response when it's a valid slug", async () => {
    const slug = await generateSlug("refactor the auth module", {
      llmCall: async () => "refactor-auth-flow",
    });
    expect(slug).toBe("refactor-auth-flow");
  });

  it("normalizes a noisy LLM response before accepting it", async () => {
    const slug = await generateSlug("refactor the auth module", {
      llmCall: async () => "Slug: `Refactor Auth Flow`",
    });
    expect(slug).toBe("refactor-auth-flow");
  });

  it("falls back to deriveSlug when the LLM call throws", async () => {
    const slug = await generateSlug("refactor the auth module across files", {
      llmCall: async () => { throw new Error("provider down"); },
    });
    // deriveSlug joins first 5 words with hyphens.
    expect(slug).toBe("refactor-the-auth-module-across");
  });

  it("falls back to deriveSlug when the LLM returns an empty string", async () => {
    const slug = await generateSlug("explain the billing webhook", {
      llmCall: async () => "",
    });
    expect(slug).toBe("explain-the-billing-webhook");
  });

  it("falls back to deriveSlug when the LLM returns unparseable garbage", async () => {
    const slug = await generateSlug("explain the billing webhook", {
      llmCall: async () => "!!! @@@ ###",
    });
    expect(slug).toBe("explain-the-billing-webhook");
  });

  it("falls back to deriveSlug when the candidate is too short", async () => {
    const slug = await generateSlug("explain the billing webhook", {
      llmCall: async () => "ab",
    });
    expect(slug).toBe("explain-the-billing-webhook");
  });
});
