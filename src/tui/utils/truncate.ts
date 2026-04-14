/**
 * Smart text truncation that preserves ANSI codes and handles wide characters.
 */
import { visibleWidth, charWidth } from "./text-width.js";

/**
 * Truncate a string to fit within maxWidth visible columns.
 * Appends ellipsis when truncated. Preserves ANSI codes that start before the cut.
 * Appends SGR reset if any ANSI codes were open.
 */
export function truncate(str: string, maxWidth: number, ellipsis = "…"): string {
  if (maxWidth <= 0) return "";
  if (visibleWidth(str) <= maxWidth) return str;

  const ellipsisWidth = visibleWidth(ellipsis);
  const targetWidth = maxWidth - ellipsisWidth;
  if (targetWidth <= 0) return ellipsis.slice(0, maxWidth);

  let width = 0;
  let i = 0;
  let hasAnsi = false;

  while (i < str.length && width < targetWidth) {
    // Skip ANSI escape sequences (they have zero width but must be preserved)
    if (str.charCodeAt(i) === 0x1b) {
      hasAnsi = true;
      // CSI sequence
      if (i + 1 < str.length && str.charCodeAt(i + 1) === 0x5b) {
        i += 2;
        while (i < str.length && str.charCodeAt(i) >= 0x20 && str.charCodeAt(i) <= 0x3f) i++;
        if (i < str.length) i++; // final byte
        continue;
      }
      // OSC sequence
      if (i + 1 < str.length && str.charCodeAt(i + 1) === 0x5d) {
        i += 2;
        while (i < str.length) {
          if (str.charCodeAt(i) === 0x07) { i++; break; }
          if (str.charCodeAt(i) === 0x1b && i + 1 < str.length && str.charCodeAt(i + 1) === 0x5c) { i += 2; break; }
          i++;
        }
        continue;
      }
      i += 2;
      continue;
    }

    const cp = str.codePointAt(i)!;
    const w = charWidth(cp);

    // Don't split a wide character
    if (width + w > targetWidth) break;

    width += w;
    i += cp > 0xffff ? 2 : 1;
  }

  // Include any trailing ANSI sequences right after the cut point
  while (i < str.length && str.charCodeAt(i) === 0x1b) {
    if (i + 1 < str.length && str.charCodeAt(i + 1) === 0x5b) {
      i += 2;
      while (i < str.length && str.charCodeAt(i) >= 0x20 && str.charCodeAt(i) <= 0x3f) i++;
      if (i < str.length) i++;
    } else {
      break;
    }
  }

  const result = str.slice(0, i) + (hasAnsi ? "\x1b[0m" : "") + ellipsis;
  return result;
}
