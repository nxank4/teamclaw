import { describe, it, expect } from "vitest";
import { truncate } from "../../../src/tui/utils/truncate.js";
import { visibleWidth } from "../../../src/tui/utils/text-width.js";

describe("truncate", () => {
  it("returns string unchanged when within maxWidth", () => {
    expect(truncate("Hello", 10)).toBe("Hello");
    expect(truncate("Hi", 2)).toBe("Hi");
  });

  it("truncates long ASCII strings with ellipsis", () => {
    const result = truncate("Hello World", 8);
    expect(visibleWidth(result)).toBeLessThanOrEqual(8);
    expect(result).toContain("…");
  });

  it("truncates CJK strings respecting double width", () => {
    const result = truncate("你好世界", 5); // each char is 2 wide
    expect(visibleWidth(result)).toBeLessThanOrEqual(5);
    expect(result).toContain("…");
  });

  it("doesn't split a wide character", () => {
    // "你好" is 4 cols; truncate to 3 should not split the second character
    const result = truncate("你好", 3);
    expect(visibleWidth(result)).toBeLessThanOrEqual(3);
  });

  it("preserves ANSI codes before truncation point", () => {
    const result = truncate("\x1b[1mHello World\x1b[0m", 8);
    expect(result).toContain("\x1b[1m"); // bold start preserved
    expect(result).toContain("\x1b[0m"); // reset appended
  });

  it("appends SGR reset when ANSI codes were present", () => {
    const result = truncate("\x1b[31mRed text here\x1b[0m", 6);
    // Should contain reset to prevent style bleeding
    expect(result).toContain("\x1b[0m");
  });

  it("returns empty string for maxWidth 0", () => {
    expect(truncate("Hello", 0)).toBe("");
  });

  it("returns just ellipsis when maxWidth equals ellipsis width", () => {
    expect(truncate("Hello World", 1)).toBe("…");
  });

  it("handles empty string", () => {
    expect(truncate("", 10)).toBe("");
  });

  it("uses custom ellipsis", () => {
    const result = truncate("Hello World", 8, "...");
    expect(result).toContain("...");
  });
});
