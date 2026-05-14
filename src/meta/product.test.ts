import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import * as product from "./product.js";
import { PRODUCT_TAGLINE_LONG, PRODUCT_TAGLINE_SHORT } from "./product.js";

describe("product metadata exports", () => {
  it("exports LONG and SHORT taglines", () => {
    expect(typeof PRODUCT_TAGLINE_LONG).toBe("string");
    expect(typeof PRODUCT_TAGLINE_SHORT).toBe("string");
    expect(PRODUCT_TAGLINE_LONG.length).toBeGreaterThan(0);
    expect(PRODUCT_TAGLINE_SHORT.length).toBeGreaterThan(0);
  });

  it("does not export PRODUCT_TAGLINE_HEADLINE", () => {
    expect((product as Record<string, unknown>).PRODUCT_TAGLINE_HEADLINE).toBeUndefined();
  });

  it("LONG matches package.json description byte-for-byte", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as { description: string };
    expect(pkg.description).toBe(PRODUCT_TAGLINE_LONG);
  });
});
