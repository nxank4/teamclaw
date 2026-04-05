import { describe, it, expect } from "vitest";
import { wrapText } from "../../../src/tui/utils/wrap.js";
import { visibleWidth } from "../../../src/tui/utils/text-width.js";

describe("wrapText", () => {
  it("returns single line when text fits", () => {
    expect(wrapText("Hello", 80)).toEqual(["Hello"]);
  });

  it("wraps at word boundary", () => {
    const lines = wrapText("Hello World", 6);
    expect(lines).toEqual(["Hello", "World"]);
  });

  it("hard wraps when no space found", () => {
    const lines = wrapText("abcdefghij", 5);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(5);
    }
  });

  it("handles CJK characters (2-wide)", () => {
    const lines = wrapText("你好世界", 5);
    // Each CJK char is 2 wide; 4 chars = 8 wide; wrap at 5
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(5);
    }
  });

  it("preserves ANSI styles across line breaks", () => {
    // Bold "Hello World" wrapped at width 6
    const lines = wrapText("\x1b[1mHello World\x1b[0m", 6);
    expect(lines.length).toBe(2);
    // First line should end with reset
    expect(lines[0]).toContain("\x1b[0m");
    // Second line should start with restore (bold)
    expect(lines[1]).toContain("\x1b[1m");
  });

  it("preserves explicit newlines", () => {
    const lines = wrapText("Line 1\nLine 2", 80);
    expect(lines).toEqual(["Line 1", "Line 2"]);
  });

  it("handles empty string", () => {
    expect(wrapText("", 80)).toEqual([""]);
  });

  it("handles width 0", () => {
    expect(wrapText("Hello", 0)).toEqual([]);
  });

  it("wraps multiple words correctly", () => {
    const lines = wrapText("The quick brown fox", 10);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(10);
    }
  });

  it("all output lines are within width limit", () => {
    const longText = "This is a longer sentence with several words that need wrapping to fit in a narrow terminal";
    const lines = wrapText(longText, 20);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(20);
    }
  });
});
