import { describe, it, expect } from "vitest";
import { TextWrapper } from "../../../src/tui/text/text-wrapper.js";

describe("TextWrapper", () => {
  it("wraps at word boundary (not mid-word)", () => {
    const tw = new TextWrapper(20);
    const result = tw.wrap("hello world this is a test");
    expect(result.lines[0]!.content).toBe("hello world this is");
    expect(result.lines[1]!.content).toBe("a test");
    expect(result.lines[1]!.isWrapped).toBe(true);
  });

  it("long word breaks at maxWidth when breakLongWords=true", () => {
    const tw = new TextWrapper(10);
    const result = tw.wrap("abcdefghijklmnop", { breakLongWords: true });
    expect(result.lines.length).toBeGreaterThan(1);
    expect(result.lines[0]!.content.length).toBeLessThanOrEqual(10);
  });

  it("preserves original newlines as hard breaks", () => {
    const tw = new TextWrapper(80);
    const result = tw.wrap("line one\nline two\nline three");
    expect(result.lines).toHaveLength(3);
    expect(result.lines[0]!.originalLineIndex).toBe(0);
    expect(result.lines[1]!.originalLineIndex).toBe(1);
    expect(result.lines[2]!.originalLineIndex).toBe(2);
  });

  it("continuation lines marked isWrapped=true", () => {
    const tw = new TextWrapper(15);
    const result = tw.wrap("this is a fairly long line that needs wrapping");
    expect(result.lines[0]!.isWrapped).toBe(false);
    expect(result.lines.some((l) => l.isWrapped)).toBe(true);
  });

  it("hangingIndent applies to all lines after first", () => {
    const tw = new TextWrapper(20);
    const result = tw.wrap("hello world this is a test", { hangingIndent: 2 });
    expect(result.lines[0]!.content).toBe("hello world this is");
    expect(result.lines[1]!.content).toMatch(/^\s{2}/);
  });

  it("maxLines truncates with ellipsis", () => {
    const tw = new TextWrapper(20);
    const result = tw.wrap("line one\nline two\nline three\nline four", { maxLines: 2 });
    expect(result.lines).toHaveLength(2);
    expect(result.wasTruncated).toBe(true);
    expect(result.lines[1]!.content).toContain("…");
  });

  it("handles empty string", () => {
    const tw = new TextWrapper(80);
    const result = tw.wrap("");
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]!.content).toBe("");
  });

  it("string exactly maxWidth does not wrap", () => {
    const tw = new TextWrapper(5);
    const result = tw.wrap("hello");
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]!.isWrapped).toBe(false);
  });

  it("ANSI codes not counted in width", () => {
    const tw = new TextWrapper(10);
    const ansi = "\x1b[31mhello\x1b[0m";
    const result = tw.wrap(ansi); // "hello" = 5 chars, fits in 10
    expect(result.lines).toHaveLength(1);
  });

  it("preserves originalText for copy reconstruction", () => {
    const tw = new TextWrapper(20);
    const original = "this is a long line that will be wrapped into multiple visual lines";
    const result = tw.wrap(original);
    expect(result.originalText).toBe(original);
  });

  it("setWidth updates wrapping width", () => {
    const tw = new TextWrapper(80);
    tw.setWidth(10);
    const result = tw.wrap("hello world test");
    expect(result.lines.length).toBeGreaterThan(1);
  });
});
