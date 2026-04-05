/**
 * Overflow handling strategies for text that exceeds available width.
 */
import { visibleWidth } from "../utils/text-width.js";
import { truncate } from "../utils/truncate.js";

export type OverflowStrategy =
  | { type: "wrap" }
  | { type: "wrap-indent"; indent: number }
  | { type: "truncate"; ellipsis?: string }
  | { type: "truncate-middle" }
  | { type: "scroll" }
  | { type: "fade" };

export class OverflowHandler {
  handle(text: string, maxWidth: number, strategy: OverflowStrategy): string {
    if (visibleWidth(text) <= maxWidth) return text;

    switch (strategy.type) {
      case "wrap":
        return text; // Wrapping handled by TextWrapper

      case "wrap-indent":
        return text; // Wrapping with indent handled by TextWrapper

      case "truncate":
        return truncate(text, maxWidth, strategy.ellipsis ?? "…");

      case "truncate-middle":
        return truncateMiddle(text, maxWidth);

      case "scroll":
        return text; // Full text returned; rendering component handles scroll

      case "fade":
        return fadeEnd(text, maxWidth);
    }
  }
}

/**
 * Truncate middle of text, keeping start and end visible.
 * "/very/long/path/to/file.ts" → "/very/.../file.ts"
 */
function truncateMiddle(text: string, maxWidth: number): string {
  if (maxWidth < 5) return truncate(text, maxWidth);

  const separator = "…";
  const sepWidth = 1;
  const available = maxWidth - sepWidth;
  const startLen = Math.ceil(available * 0.6);
  const endLen = available - startLen;

  const start = extractVisibleChars(text, startLen);
  const end = extractVisibleCharsFromEnd(text, endLen);

  return start + separator + end;
}

/** Extract first N visible characters from a string. */
function extractVisibleChars(text: string, count: number): string {
  let width = 0;
  let i = 0;

  while (i < text.length && width < count) {
    if (text.charCodeAt(i) === 0x1b) {
      // Skip ANSI
      if (i + 1 < text.length && text.charCodeAt(i + 1) === 0x5b) {
        i += 2;
        while (i < text.length && text.charCodeAt(i) >= 0x20 && text.charCodeAt(i) <= 0x3f) i++;
        if (i < text.length) i++;
        continue;
      }
      i += 2;
      continue;
    }
    const cp = text.codePointAt(i)!;
    const w = cp > 0x7f && cp <= 0xffff ? (isWide(cp) ? 2 : 1) : 1;
    if (width + w > count) break;
    width += w;
    i += cp > 0xffff ? 2 : 1;
  }

  return text.slice(0, i);
}

/** Extract last N visible characters from a string (plain text only). */
function extractVisibleCharsFromEnd(text: string, count: number): string {
  // Simple approach: strip ANSI, take from end
  const stripped = text.replace(/\x1b(?:\[[0-9;]*[A-Za-z]|\][^\x07\x1b]*(?:\x07|\x1b\\))/g, "");
  if (stripped.length <= count) return stripped;
  return stripped.slice(-count);
}

/** Fade the end of text — dim last 3 characters + add → indicator. */
function fadeEnd(text: string, maxWidth: number): string {
  const truncated = truncate(text, maxWidth - 1, "");
  return truncated + "\x1b[2m→\x1b[22m";
}

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7af) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe6f) ||
    (cp >= 0xff01 && cp <= 0xff60) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}
