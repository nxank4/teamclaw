/**
 * ANSI-aware text wrapping that preserves styling across line breaks.
 */
import { visibleWidth, charWidth } from "./text-width.js";

/**
 * Track active SGR (Select Graphic Rendition) state.
 * When wrapping text, we need to re-apply active styles at the start of each new line
 * and reset at the end.
 */
class AnsiStateTracker {
  private activeCodes: string[] = [];

  /** Process an SGR sequence and update tracked state. */
  processSgr(sequence: string): void {
    // Extract codes from \x1b[...m
    const match = sequence.match(/\x1b\[([0-9;]*)m/);
    if (!match) return;
    const codes = match[1] === "" ? ["0"] : match[1]!.split(";");

    for (const code of codes) {
      const n = parseInt(code, 10);
      if (n === 0) {
        this.activeCodes = [];
      } else {
        // Track the code (simplified — full tracking would handle reset pairs)
        this.activeCodes.push(code);
      }
    }
  }

  /** Get the SGR sequence to re-apply current state at start of a new line. */
  getRestoreSequence(): string {
    if (this.activeCodes.length === 0) return "";
    return `\x1b[${this.activeCodes.join(";")}m`;
  }

  /** Check if any styles are active. */
  hasActiveStyles(): boolean {
    return this.activeCodes.length > 0;
  }
}

/**
 * Wrap text to fit within the given width, preserving ANSI styling across breaks.
 * Wraps on word boundaries (spaces) when possible, otherwise hard-wraps.
 */
export function wrapText(str: string, width: number): string[] {
  if (width <= 0) return [];

  const inputLines = str.split("\n");
  const result: string[] = [];

  for (const inputLine of inputLines) {
    if (visibleWidth(inputLine) <= width) {
      result.push(inputLine);
      continue;
    }

    // Need to wrap this line
    const tracker = new AnsiStateTracker();
    let currentLine = "";
    let currentWidth = 0;
    let lastSpaceIdx = -1;
    let i = 0;

    while (i < inputLine.length) {
      // Handle ANSI escape sequences (zero width, pass through)
      if (inputLine.charCodeAt(i) === 0x1b) {
        const seqStart = i;
        // CSI sequence
        if (i + 1 < inputLine.length && inputLine.charCodeAt(i + 1) === 0x5b) {
          i += 2;
          while (i < inputLine.length && inputLine.charCodeAt(i) >= 0x20 && inputLine.charCodeAt(i) <= 0x3f) i++;
          if (i < inputLine.length) i++;
          const seq = inputLine.slice(seqStart, i);
          tracker.processSgr(seq);
          currentLine += seq;
          continue;
        }
        // OSC sequence
        if (i + 1 < inputLine.length && inputLine.charCodeAt(i + 1) === 0x5d) {
          i += 2;
          while (i < inputLine.length) {
            if (inputLine.charCodeAt(i) === 0x07) { i++; break; }
            if (inputLine.charCodeAt(i) === 0x1b && i + 1 < inputLine.length && inputLine.charCodeAt(i + 1) === 0x5c) { i += 2; break; }
            i++;
          }
          currentLine += inputLine.slice(seqStart, i);
          continue;
        }
        i += 2;
        currentLine += inputLine.slice(seqStart, i);
        continue;
      }

      const cp = inputLine.codePointAt(i)!;
      const w = charWidth(cp);
      const charLen = cp > 0xffff ? 2 : 1;
      const char = inputLine.slice(i, i + charLen);

      // Track spaces for word-wrap
      if (char === " ") {
        lastSpaceIdx = currentLine.length;
      }

      // Would exceed width — need to break
      if (currentWidth + w > width) {
        if (lastSpaceIdx > 0) {
          // Break at last space (word wrap)
          const lineContent = currentLine.slice(0, lastSpaceIdx);
          result.push(lineContent + (tracker.hasActiveStyles() ? "\x1b[0m" : ""));
          const remainder = currentLine.slice(lastSpaceIdx + 1);
          currentLine = tracker.getRestoreSequence() + remainder;
          currentWidth = visibleWidth(remainder);
        } else {
          // Hard wrap (no space found)
          result.push(currentLine + (tracker.hasActiveStyles() ? "\x1b[0m" : ""));
          currentLine = tracker.getRestoreSequence();
          currentWidth = 0;
        }
        lastSpaceIdx = -1;
        // Don't advance i — re-process this character on the new line
        continue;
      }

      currentLine += char;
      currentWidth += w;
      i += charLen;
    }

    // Push remaining content
    if (currentLine.length > 0) {
      result.push(currentLine);
    }
  }

  return result;
}
