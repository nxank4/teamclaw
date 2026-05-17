import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { deriveSlug, nextAvailableSlug } from "../../src/spec/slug.js";

describe("deriveSlug", () => {
  it("kebab-cases the first 5 words", () => {
    expect(deriveSlug("Refactor the authentication module across login")).toBe(
      "refactor-the-authentication-module-across",
    );
  });

  it("strips punctuation and special chars", () => {
    expect(deriveSlug("Fix the @auth #bug !!!")).toBe("fix-the-auth-bug");
  });

  it("falls back to 'untitled' when the prompt is empty or pure punctuation", () => {
    expect(deriveSlug("")).toBe("untitled");
    expect(deriveSlug("!@#$%^&*()")).toBe("untitled");
  });

  it("truncates after 60 chars", () => {
    const long = "supercalifragilisticexpialidocious-and-a-very-long-string-of-words-here yes really truly";
    expect(deriveSlug(long).length).toBeLessThanOrEqual(60);
  });

  it("collapses multiple hyphens", () => {
    expect(deriveSlug("a   b   c")).toBe("a-b-c");
  });
});

describe("nextAvailableSlug", () => {
  it("returns base when file does not exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "op-slug-"));
    try {
      expect(nextAvailableSlug("alpha", dir)).toBe("alpha");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns -2 when base is taken", () => {
    const dir = mkdtempSync(join(tmpdir(), "op-slug-"));
    try {
      writeFileSync(join(dir, "alpha.md"), "x");
      expect(nextAvailableSlug("alpha", dir)).toBe("alpha-2");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns -3 when base and -2 are taken", () => {
    const dir = mkdtempSync(join(tmpdir(), "op-slug-"));
    try {
      writeFileSync(join(dir, "alpha.md"), "x");
      writeFileSync(join(dir, "alpha-2.md"), "x");
      expect(nextAvailableSlug("alpha", dir)).toBe("alpha-3");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
