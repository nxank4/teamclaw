/**
 * Intelligent word wrapping with logical→visual line tracking.
 * Wraps at word boundaries, preserves original text for copy/paste reconstruction.
 */
import { visibleWidth, charWidth } from "../utils/text-width.js";

export interface WrapOptions {
  indent?: number;
  preserveNewlines?: boolean;
  breakLongWords?: boolean;
  hangingIndent?: number;
  maxLines?: number;
  ellipsis?: string;
}

export interface WrappedLine {
  content: string;
  isWrapped: boolean;
  originalLineIndex: number;
  originalStartOffset: number;
  originalEndOffset: number;
}

export interface WrappedText {
  lines: WrappedLine[];
  originalText: string;
  totalVisualLines: number;
  wasTruncated: boolean;
}

export class TextWrapper {
  private maxWidth: number;

  constructor(maxWidth: number) {
    this.maxWidth = Math.max(1, maxWidth);
  }

  setWidth(width: number): void {
    this.maxWidth = Math.max(1, width);
  }

  wrap(text: string, options?: WrapOptions): WrappedText {
    const opts: Required<WrapOptions> = {
      indent: options?.indent ?? 0,
      preserveNewlines: options?.preserveNewlines ?? true,
      breakLongWords: options?.breakLongWords ?? true,
      hangingIndent: options?.hangingIndent ?? 0,
      maxLines: options?.maxLines ?? 0,
      ellipsis: options?.ellipsis ?? "…",
    };

    if (!text) {
      return { lines: [{ content: "", isWrapped: false, originalLineIndex: 0, originalStartOffset: 0, originalEndOffset: 0 }], originalText: text, totalVisualLines: 1, wasTruncated: false };
    }

    const originalLines = opts.preserveNewlines ? text.split("\n") : [text];
    const result: WrappedLine[] = [];
    let wasTruncated = false;

    for (let lineIdx = 0; lineIdx < originalLines.length; lineIdx++) {
      const origLine = originalLines[lineIdx]!;
      const isFirstVisualOfOriginal = true;
      const wrappedLines = this.wrapSingleLine(origLine, lineIdx, opts, isFirstVisualOfOriginal);
      result.push(...wrappedLines);

      if (opts.maxLines > 0 && result.length >= opts.maxLines) {
        wasTruncated = lineIdx < originalLines.length - 1 || wrappedLines.length > (opts.maxLines - (result.length - wrappedLines.length));
        result.length = opts.maxLines;
        if (wasTruncated) {
          const last = result[result.length - 1]!;
          const ellipsisWidth = visibleWidth(opts.ellipsis);
          if (visibleWidth(last.content) + ellipsisWidth <= this.maxWidth) {
            last.content += opts.ellipsis;
          } else {
            // Truncate last line to fit ellipsis
            last.content = truncateToFit(last.content, this.maxWidth - ellipsisWidth) + opts.ellipsis;
          }
        }
        break;
      }
    }

    return {
      lines: result,
      originalText: text,
      totalVisualLines: result.length,
      wasTruncated,
    };
  }

  private wrapSingleLine(
    line: string,
    originalLineIndex: number,
    opts: Required<WrapOptions>,
    _isFirstOfOriginal: boolean,
  ): WrappedLine[] {
    if (visibleWidth(line) <= this.maxWidth) {
      return [{
        content: line,
        isWrapped: false,
        originalLineIndex,
        originalStartOffset: 0,
        originalEndOffset: line.length,
      }];
    }

    const results: WrappedLine[] = [];
    let remaining = line;
    let offset = 0;
    let isFirst = true;

    while (remaining.length > 0) {
      const availWidth = isFirst ? this.maxWidth : this.maxWidth - (opts.indent + opts.hangingIndent);
      if (availWidth <= 0) break;

      if (visibleWidth(remaining) <= availWidth) {
        const indent = isFirst ? "" : " ".repeat(opts.indent + opts.hangingIndent);
        results.push({
          content: indent + remaining,
          isWrapped: !isFirst,
          originalLineIndex,
          originalStartOffset: offset,
          originalEndOffset: offset + remaining.length,
        });
        break;
      }

      // Find break point
      const { breakAt } = findBreakPoint(remaining, availWidth);

      if (breakAt <= 0 && opts.breakLongWords) {
        // Hard break at availWidth
        const hardBreak = findHardBreak(remaining, availWidth);
        const segment = remaining.slice(0, hardBreak);
        const indent = isFirst ? "" : " ".repeat(opts.indent + opts.hangingIndent);
        results.push({
          content: indent + segment,
          isWrapped: !isFirst,
          originalLineIndex,
          originalStartOffset: offset,
          originalEndOffset: offset + hardBreak,
        });
        offset += hardBreak;
        remaining = remaining.slice(hardBreak);
      } else if (breakAt <= 0) {
        // Can't break and breakLongWords=false — emit as-is
        const indent = isFirst ? "" : " ".repeat(opts.indent + opts.hangingIndent);
        results.push({
          content: indent + remaining,
          isWrapped: !isFirst,
          originalLineIndex,
          originalStartOffset: offset,
          originalEndOffset: offset + remaining.length,
        });
        break;
      } else {
        const segment = remaining.slice(0, breakAt);
        const indent = isFirst ? "" : " ".repeat(opts.indent + opts.hangingIndent);
        results.push({
          content: indent + segment,
          isWrapped: !isFirst,
          originalLineIndex,
          originalStartOffset: offset,
          originalEndOffset: offset + breakAt,
        });
        // Skip the space at break point
        const skipChar = remaining[breakAt] === " " ? 1 : 0;
        offset += breakAt + skipChar;
        remaining = remaining.slice(breakAt + skipChar);
      }

      isFirst = false;
    }

    return results;
  }
}

/** Find the last word boundary before maxWidth. Returns char index. */
function findBreakPoint(text: string, maxWidth: number): { breakAt: number; visWidth: number } {
  let width = 0;
  let lastSpace = -1;
  let lastSpaceWidth = 0;
  let i = 0;

  while (i < text.length) {
    // Skip ANSI sequences
    if (text.charCodeAt(i) === 0x1b) {
      if (i + 1 < text.length && text.charCodeAt(i + 1) === 0x5b) {
        i += 2;
        while (i < text.length && text.charCodeAt(i) >= 0x20 && text.charCodeAt(i) <= 0x3f) i++;
        if (i < text.length) i++;
        continue;
      }
      if (i + 1 < text.length && text.charCodeAt(i + 1) === 0x5d) {
        i += 2;
        while (i < text.length) {
          if (text.charCodeAt(i) === 0x07) { i++; break; }
          if (text.charCodeAt(i) === 0x1b && i + 1 < text.length && text.charCodeAt(i + 1) === 0x5c) { i += 2; break; }
          i++;
        }
        continue;
      }
      i += 2;
      continue;
    }

    const cp = text.codePointAt(i)!;
    const w = charWidth(cp);
    const charLen = cp > 0xffff ? 2 : 1;

    if (width + w > maxWidth) break;

    if (text[i] === " " || text[i] === "-") {
      lastSpace = i + (text[i] === "-" ? 1 : 0); // break after hyphen, at space
      lastSpaceWidth = width + w;
    }

    width += w;
    i += charLen;
  }

  return { breakAt: lastSpace, visWidth: lastSpaceWidth };
}

/** Find hard break point at exactly maxWidth visible chars. */
function findHardBreak(text: string, maxWidth: number): number {
  let width = 0;
  let i = 0;

  while (i < text.length) {
    if (text.charCodeAt(i) === 0x1b) {
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
    const w = charWidth(cp);
    if (width + w > maxWidth) break;
    width += w;
    i += cp > 0xffff ? 2 : 1;
  }

  return i;
}

/** Truncate text to fit within maxWidth visible columns. */
function truncateToFit(text: string, maxWidth: number): string {
  let width = 0;
  let i = 0;

  while (i < text.length && width < maxWidth) {
    if (text.charCodeAt(i) === 0x1b) {
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
    const w = charWidth(cp);
    if (width + w > maxWidth) break;
    width += w;
    i += cp > 0xffff ? 2 : 1;
  }
  return text.slice(0, i);
}
