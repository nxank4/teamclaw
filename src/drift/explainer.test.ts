import { describe, it, expect } from "vitest";
import { generateExplanation } from "./explainer.js";

describe("generateExplanation", () => {
  it("uses direct template for direct conflicts", () => {
    const result = generateExplanation(
      "direct",
      "Redis caching",
      "Avoid Redis for sessions",
      "JWT is more scalable",
      "session storage",
    );
    expect(result).toContain("Redis caching");
    expect(result).toContain("Avoid Redis");
    expect(result).toContain("JWT is more scalable");
  });

  it("uses indirect template for indirect conflicts", () => {
    const result = generateExplanation(
      "indirect",
      "MySQL database",
      "Prefer PostgreSQL over MySQL",
      "Better JSON support",
      "database",
    );
    expect(result).toContain("MySQL database");
    expect(result).toContain("Prefer PostgreSQL");
  });

  it("uses ambiguous template for ambiguous conflicts", () => {
    const result = generateExplanation(
      "ambiguous",
      "Redis setup",
      "Use Redis for caching",
      "Fast lookups",
      "caching strategy",
    );
    expect(result).toContain("caching strategy");
  });

  it("truncates long reasoning", () => {
    const longReasoning = "A".repeat(200);
    const result = generateExplanation("direct", "X", "Y", longReasoning, "T");
    expect(result.length).toBeLessThan(longReasoning.length + 100);
  });

  it("handles empty strings without crashing", () => {
    const result = generateExplanation("direct", "", "", "", "");
    expect(typeof result).toBe("string");
  });
});
