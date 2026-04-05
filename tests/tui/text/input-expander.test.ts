import { describe, it, expect } from "vitest";
import { InputExpander } from "../../../src/tui/text/input-expander.js";

describe("InputExpander", () => {
  it("single-line text: height = 1", () => {
    const ie = new InputExpander(10, 24);
    expect(ie.calculateHeight("hello", 80)).toBe(1);
  });

  it("two-line text: height = 2", () => {
    const ie = new InputExpander(10, 24);
    expect(ie.calculateHeight("line one\nline two", 80)).toBe(2);
  });

  it("expansion capped at maxHeight", () => {
    const ie = new InputExpander(3, 100);
    expect(ie.calculateHeight("a\nb\nc\nd\ne\nf", 80)).toBe(3);
  });

  it("expansion capped at 1/3 terminal height", () => {
    const ie = new InputExpander(20, 12); // 1/3 of 12 = 4
    expect(ie.calculateHeight("a\nb\nc\nd\ne\nf\ng\nh\ni\nj", 80)).toBe(4);
  });

  it("shouldExpand returns false for single line", () => {
    const ie = new InputExpander(10, 24);
    expect(ie.shouldExpand("hello", 80)).toBe(false);
  });

  it("shouldExpand returns true for multi-line", () => {
    const ie = new InputExpander(10, 24);
    expect(ie.shouldExpand("a\nb", 80)).toBe(true);
  });

  it("resize updates calculations", () => {
    const ie = new InputExpander(20, 24);
    ie.onResize(9); // 1/3 of 9 = 3
    expect(ie.getEffectiveMaxHeight()).toBe(3);
  });

  it("getVisibleRange returns correct range around cursor", () => {
    const ie = new InputExpander(3, 24);
    const range = ie.getVisibleRange("a\nb\nc\nd\ne", 3, 3);
    // Cursor at line 3, visible height 3 → should show lines around cursor
    expect(range.endLine - range.startLine + 1).toBeLessThanOrEqual(3);
    expect(range.startLine).toBeLessThanOrEqual(3);
    expect(range.endLine).toBeGreaterThanOrEqual(3);
  });
});
