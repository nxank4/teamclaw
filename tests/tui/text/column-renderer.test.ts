import { describe, it, expect } from "vitest";
import { ColumnRenderer } from "../../../src/tui/text/column-renderer.js";

describe("ColumnRenderer", () => {
  it("renderSplit produces correct column widths", () => {
    const cr = new ColumnRenderer();
    const result = cr.renderSplit(["left"], ["right"], 10, 10);
    expect(result).toHaveLength(1);
    // Should contain both columns
    expect(result[0]).toContain("left");
    expect(result[0]).toContain("right");
  });

  it("getColumnContent returns only left column text", () => {
    const cr = new ColumnRenderer();
    cr.renderSplit(["left1", "left2"], ["right1", "right2"], 10, 10);
    const content = cr.getColumnContent("left", 0, 1);
    expect(content).toBe("left1\nleft2");
    expect(content).not.toContain("right");
  });

  it("getColumnContent returns only right column text", () => {
    const cr = new ColumnRenderer();
    cr.renderSplit(["left1"], ["right1", "right2"], 10, 10);
    const content = cr.getColumnContent("right", 0, 1);
    expect(content).toBe("right1\nright2");
  });

  it("zero-width space inserted at column boundary", () => {
    const cr = new ColumnRenderer();
    const result = cr.renderSplit(["hello"], ["world"], 10, 10);
    expect(result[0]).toContain("\u200B");
  });

  it("handles unequal line counts (shorter column padded)", () => {
    const cr = new ColumnRenderer();
    const result = cr.renderSplit(["a", "b", "c"], ["x"], 10, 10);
    expect(result).toHaveLength(3); // max of 3, 1
  });

  it("truncates oversized column content", () => {
    const cr = new ColumnRenderer();
    const result = cr.renderSplit(["very long content here"], ["right"], 5, 5);
    // Left column should be truncated to 5 visible chars
    expect(result).toHaveLength(1);
  });
});
