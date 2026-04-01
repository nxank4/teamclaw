import { describe, it, expect } from "vitest";
import { charWidth, visibleWidth, stripAnsi } from "../../../src/tui/utils/text-width.js";

describe("charWidth", () => {
  it("ASCII letters and digits have width 1", () => {
    expect(charWidth("A".codePointAt(0)!)).toBe(1);
    expect(charWidth("z".codePointAt(0)!)).toBe(1);
    expect(charWidth("0".codePointAt(0)!)).toBe(1);
    expect(charWidth(" ".codePointAt(0)!)).toBe(1);
  });

  it("CJK ideographs have width 2", () => {
    expect(charWidth("你".codePointAt(0)!)).toBe(2);
    expect(charWidth("好".codePointAt(0)!)).toBe(2);
    expect(charWidth("世".codePointAt(0)!)).toBe(2);
    expect(charWidth("界".codePointAt(0)!)).toBe(2);
  });

  it("fullwidth ASCII has width 2", () => {
    expect(charWidth("Ａ".codePointAt(0)!)).toBe(2); // U+FF21
    expect(charWidth("１".codePointAt(0)!)).toBe(2); // U+FF11
  });

  it("Hangul syllables have width 2", () => {
    expect(charWidth("한".codePointAt(0)!)).toBe(2);
    expect(charWidth("글".codePointAt(0)!)).toBe(2);
  });

  it("Hiragana and Katakana have width 2", () => {
    expect(charWidth("あ".codePointAt(0)!)).toBe(2);
    expect(charWidth("ア".codePointAt(0)!)).toBe(2);
  });

  it("common emoji have width 2", () => {
    expect(charWidth(0x1f600)).toBe(2); // 😀
    expect(charWidth(0x1f4a9)).toBe(2); // 💩
    expect(charWidth(0x2764)).toBe(2);  // ❤
    expect(charWidth(0x2728)).toBe(2);  // ✨
  });

  it("control characters have width 0", () => {
    expect(charWidth(0x00)).toBe(0); // NUL
    expect(charWidth(0x01)).toBe(0); // SOH
    expect(charWidth(0x1f)).toBe(0); // US
    expect(charWidth(0x7f)).toBe(0); // DEL
  });

  it("combining marks have width 0", () => {
    expect(charWidth(0x0300)).toBe(0); // Combining Grave Accent
    expect(charWidth(0x0301)).toBe(0); // Combining Acute Accent
    expect(charWidth(0x036f)).toBe(0); // Combining Latin Small Letter X
  });

  it("zero-width characters have width 0", () => {
    expect(charWidth(0x200b)).toBe(0); // Zero Width Space
    expect(charWidth(0x200d)).toBe(0); // ZWJ
    expect(charWidth(0xfeff)).toBe(0); // BOM
    expect(charWidth(0x00ad)).toBe(0); // Soft Hyphen
  });

  it("variation selectors have width 0", () => {
    expect(charWidth(0xfe00)).toBe(0);
    expect(charWidth(0xfe0f)).toBe(0);
  });

  it("Latin accented characters have width 1", () => {
    expect(charWidth("é".codePointAt(0)!)).toBe(1);
    expect(charWidth("ñ".codePointAt(0)!)).toBe(1);
    expect(charWidth("ü".codePointAt(0)!)).toBe(1);
    expect(charWidth("ø".codePointAt(0)!)).toBe(1);
  });
});

describe("stripAnsi", () => {
  it("removes SGR sequences", () => {
    expect(stripAnsi("\x1b[1mBold\x1b[0m")).toBe("Bold");
    expect(stripAnsi("\x1b[38;2;255;0;0mRed\x1b[0m")).toBe("Red");
  });

  it("removes CSI sequences", () => {
    expect(stripAnsi("\x1b[2K")).toBe(""); // clear line
    expect(stripAnsi("\x1b[?25h")).toBe(""); // show cursor
    expect(stripAnsi("\x1b[?2026h")).toBe(""); // sync start
  });

  it("removes OSC sequences", () => {
    expect(stripAnsi("\x1b]8;;https://example.com\x1b\\Link\x1b]8;;\x1b\\")).toBe("Link");
    expect(stripAnsi("\x1b]8;;url\x07text\x1b]8;;\x07")).toBe("text");
  });

  it("preserves normal text", () => {
    expect(stripAnsi("Hello World")).toBe("Hello World");
    expect(stripAnsi("你好世界")).toBe("你好世界");
  });
});

describe("visibleWidth", () => {
  it("ASCII string width equals length", () => {
    expect(visibleWidth("Hello")).toBe(5);
    expect(visibleWidth("Hello World")).toBe(11);
  });

  it("CJK string has double width", () => {
    expect(visibleWidth("你好")).toBe(4);
    expect(visibleWidth("世界")).toBe(4);
  });

  it("ANSI codes have zero width", () => {
    expect(visibleWidth("\x1b[1mBold\x1b[0m")).toBe(4);
    expect(visibleWidth("\x1b[38;2;255;0;0mRed\x1b[0m")).toBe(3);
  });

  it("mixed ASCII + CJK + ANSI", () => {
    expect(visibleWidth("\x1b[1mHello\x1b[0m 你好")).toBe(10); // "Hello" (5) + " " (1) + "你好" (4) = 10
  });

  it("empty string has width 0", () => {
    expect(visibleWidth("")).toBe(0);
  });

  it("tab expands to next 8-column stop", () => {
    expect(visibleWidth("\t")).toBe(8);
    expect(visibleWidth("ab\t")).toBe(8); // 2 chars + tab to col 8
    expect(visibleWidth("abcdefgh\t")).toBe(16); // 8 chars + tab to col 16
  });

  it("OSC 8 hyperlinks have zero width", () => {
    const link = "\x1b]8;;https://example.com\x1b\\Click here\x1b]8;;\x1b\\";
    expect(visibleWidth(link)).toBe(10); // "Click here"
  });

  it("surrogate pairs (emoji) counted correctly", () => {
    expect(visibleWidth("😀")).toBe(2);
    expect(visibleWidth("Hello 😀")).toBe(8); // 6 + 2
  });

  it("combining marks don't add width", () => {
    // e + combining acute accent = é (visually 1 character)
    expect(visibleWidth("e\u0301")).toBe(1);
  });
});
