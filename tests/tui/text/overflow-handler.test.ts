import { describe, it, expect } from "vitest";
import { OverflowHandler } from "../../../src/tui/text/overflow-handler.js";
import { stripAnsi } from "../../../src/tui/utils/text-width.js";

describe("OverflowHandler", () => {
  const oh = new OverflowHandler();

  it("wrap strategy returns text as-is (wrapping done externally)", () => {
    const result = oh.handle("long text here", 5, { type: "wrap" });
    expect(result).toBe("long text here");
  });

  it("truncate strategy adds ellipsis", () => {
    const result = oh.handle("hello world this is long", 10, { type: "truncate" });
    expect(stripAnsi(result).length).toBeLessThanOrEqual(10);
    expect(result).toContain("…");
  });

  it("truncate-middle keeps start and end", () => {
    const result = oh.handle("/very/long/path/to/file.ts", 20, { type: "truncate-middle" });
    expect(result).toContain("…");
    expect(result.startsWith("/very")).toBe(true);
    expect(result.endsWith(".ts")).toBe(true);
  });

  it("scroll strategy returns full text", () => {
    const result = oh.handle("long code line here", 10, { type: "scroll" });
    expect(result).toBe("long code line here");
  });

  it("fade strategy dims end with arrow", () => {
    const result = oh.handle("hello world this is very long", 15, { type: "fade" });
    expect(stripAnsi(result)).toContain("→");
  });

  it("short text returns unchanged for all strategies", () => {
    expect(oh.handle("hi", 10, { type: "truncate" })).toBe("hi");
    expect(oh.handle("hi", 10, { type: "truncate-middle" })).toBe("hi");
    expect(oh.handle("hi", 10, { type: "fade" })).toBe("hi");
  });
});
