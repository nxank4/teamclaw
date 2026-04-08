/**
 * Text width calculation for terminal rendering.
 * Handles CJK characters, emoji, ANSI escape codes, and combining marks.
 * Zero external dependencies — uses Unicode ranges from UAX #11.
 */

// ANSI escape sequences to strip for width calculation
const ANSI_RE = /\x1b(?:\[[0-9;]*[A-Za-z]|\][^\x07\x1b]*(?:\x07|\x1b\\)|\[[?][0-9;]*[hl])/g;

/** Strip all ANSI escape sequences from a string. */
export function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, "");
}

/**
 * Get the display width of a single Unicode code point.
 * Returns 0 for control characters and combining marks,
 * 2 for wide/fullwidth characters (CJK, emoji),
 * 1 for everything else.
 */
export function charWidth(cp: number): 0 | 1 | 2 {
  // Control characters (except HT which is handled separately)
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0;

  // Combining marks and zero-width characters
  if (
    (cp >= 0x0300 && cp <= 0x036f) || // Combining Diacritical Marks
    (cp >= 0x0483 && cp <= 0x0489) || // Cyrillic combining marks
    (cp >= 0x0591 && cp <= 0x05bd) || // Hebrew combining marks
    (cp >= 0x0610 && cp <= 0x061a) || // Arabic combining marks
    (cp >= 0x064b && cp <= 0x065f) || // Arabic combining marks
    (cp >= 0x0670 && cp === 0x0670) || // Arabic letter superscript alef
    (cp >= 0x06d6 && cp <= 0x06dc) || // Arabic small marks
    (cp >= 0x06df && cp <= 0x06e4) || // Arabic small marks
    (cp >= 0x06e7 && cp <= 0x06e8) || // Arabic small marks
    (cp >= 0x06ea && cp <= 0x06ed) || // Arabic combining marks
    (cp >= 0x0730 && cp <= 0x074a) || // Syriac marks
    (cp >= 0x0e31 && cp === 0x0e31) || // Thai combining mark
    (cp >= 0x0e34 && cp <= 0x0e3a) || // Thai combining marks
    (cp >= 0x0e47 && cp <= 0x0e4e) || // Thai combining marks
    (cp >= 0x0eb1 && cp === 0x0eb1) || // Lao combining mark
    (cp >= 0x0eb4 && cp <= 0x0ebc) || // Lao combining marks
    (cp >= 0x0ec8 && cp <= 0x0ece) || // Lao combining marks
    (cp >= 0x1dc0 && cp <= 0x1dff) || // Combining Diacritical Marks Supplement
    (cp >= 0x20d0 && cp <= 0x20ff) || // Combining Diacritical Marks for Symbols
    (cp >= 0xfe00 && cp <= 0xfe0f) || // Variation Selectors
    (cp >= 0xfe20 && cp <= 0xfe2f) || // Combining Half Marks
    cp === 0x200b || // Zero Width Space
    cp === 0x200c || // Zero Width Non-Joiner
    cp === 0x200d || // Zero Width Joiner
    cp === 0x200e || // Left-to-Right Mark
    cp === 0x200f || // Right-to-Left Mark
    cp === 0x2028 || // Line Separator
    cp === 0x2029 || // Paragraph Separator
    cp === 0x202a || // Left-to-Right Embedding
    cp === 0x202b || // Right-to-Left Embedding
    cp === 0x202c || // Pop Directional Formatting
    cp === 0x202d || // Left-to-Right Override
    cp === 0x202e || // Right-to-Left Override
    cp === 0x2060 || // Word Joiner
    cp === 0x2061 || // Function Application
    cp === 0x2062 || // Invisible Times
    cp === 0x2063 || // Invisible Separator
    cp === 0x2064 || // Invisible Plus
    cp === 0xfeff || // Zero Width No-Break Space (BOM)
    cp === 0x00ad || // Soft Hyphen
    (cp >= 0xe0100 && cp <= 0xe01ef) // Variation Selectors Supplement
  ) {
    return 0;
  }

  // Wide characters: CJK, fullwidth forms, certain symbols
  if (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    (cp >= 0x231a && cp <= 0x231b) || // Watch, Hourglass
    (cp >= 0x2329 && cp <= 0x232a) || // Angle brackets
    (cp >= 0x23e9 && cp <= 0x23f3) || // Various symbols
    (cp >= 0x23f8 && cp <= 0x23fa) || // Various symbols
    (cp >= 0x25fd && cp <= 0x25fe) || // Medium squares
    (cp >= 0x2614 && cp <= 0x2615) || // Umbrella, Hot beverage
    (cp >= 0x2648 && cp <= 0x2653) || // Zodiac signs
    cp === 0x267f || // Wheelchair
    cp === 0x2693 || // Anchor
    cp === 0x26a1 || // High voltage
    (cp >= 0x26aa && cp <= 0x26ab) || // Circles
    (cp >= 0x26bd && cp <= 0x26be) || // Soccer, baseball
    (cp >= 0x26c4 && cp <= 0x26c5) || // Snowman, Sun
    cp === 0x26ce || // Ophiuchus
    cp === 0x26d4 || // No entry
    cp === 0x26ea || // Church
    (cp >= 0x26f2 && cp <= 0x26f3) || // Fountain, Golf
    cp === 0x26f5 || // Sailboat
    cp === 0x26fa || // Tent
    cp === 0x26fd || // Fuel pump
    cp === 0x2702 || // Scissors
    cp === 0x2705 || // Check mark
    (cp >= 0x2708 && cp <= 0x270d) || // Various symbols
    cp === 0x270f || // Pencil
    cp === 0x2712 || // Black nib
    cp === 0x2714 || // Check mark
    cp === 0x2716 || // Cross mark
    cp === 0x271d || // Latin cross
    cp === 0x2721 || // Star of David
    cp === 0x2728 || // Sparkles
    (cp >= 0x2733 && cp <= 0x2734) || // Eight spoked asterisk
    cp === 0x2744 || // Snowflake
    cp === 0x2747 || // Sparkle
    cp === 0x274c || // Cross mark
    cp === 0x274e || // Cross mark
    (cp >= 0x2753 && cp <= 0x2755) || // Question marks
    cp === 0x2757 || // Exclamation mark
    (cp >= 0x2763 && cp <= 0x2764) || // Heart
    (cp >= 0x2795 && cp <= 0x2797) || // Plus, minus, divide
    cp === 0x27a1 || // Right arrow
    cp === 0x27b0 || // Curly loop
    cp === 0x27bf || // Double curly loop
    (cp >= 0x2934 && cp <= 0x2935) || // Arrows
    (cp >= 0x2b05 && cp <= 0x2b07) || // Arrows
    (cp >= 0x2b1b && cp <= 0x2b1c) || // Squares
    cp === 0x2b50 || // Star
    cp === 0x2b55 || // Circle
    cp === 0x3030 || // Wavy dash
    cp === 0x303d || // Part alternation mark
    cp === 0x3297 || // Circled ideograph congratulation
    cp === 0x3299 || // Circled ideograph secret
    (cp >= 0x2e80 && cp <= 0x2fdf) || // CJK Radicals
    (cp >= 0x2ff0 && cp <= 0x303e) || // CJK Symbols (except 0x303f)
    (cp >= 0x3041 && cp <= 0x33bf) || // Hiragana, Katakana, Bopomofo, Hangul Compat, Kanbun, CJK Strokes
    (cp >= 0x33c0 && cp <= 0x33ff) || // CJK Compat Ideographs
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Unified Ideographs Extension A
    (cp >= 0x4e00 && cp <= 0xa4cf) || // CJK Unified Ideographs + Yi
    (cp >= 0xa960 && cp <= 0xa97f) || // Hangul Jamo Extended-A
    (cp >= 0xac00 && cp <= 0xd7af) || // Hangul Syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK Compatibility Ideographs
    (cp >= 0xfe10 && cp <= 0xfe19) || // Vertical forms
    (cp >= 0xfe30 && cp <= 0xfe6f) || // CJK Compat Forms + Small Form Variants
    (cp >= 0xff01 && cp <= 0xff60) || // Fullwidth ASCII
    (cp >= 0xffe0 && cp <= 0xffe6) || // Fullwidth symbols
    (cp >= 0x1f004 && cp === 0x1f004) || // Mahjong tile
    cp === 0x1f0cf || // Playing card
    (cp >= 0x1f170 && cp <= 0x1f171) || // Negative squared letters
    cp === 0x1f17e || // Negative squared O
    cp === 0x1f17f || // Negative squared P
    cp === 0x1f18e || // Negative squared AB
    (cp >= 0x1f191 && cp <= 0x1f19a) || // Squared symbols
    (cp >= 0x1f1e0 && cp <= 0x1f1ff) || // Regional indicator symbols (flags)
    (cp >= 0x1f200 && cp <= 0x1f202) || // Enclosed ideographic supplement
    cp === 0x1f21a || // Squared CJK
    cp === 0x1f22f || // Squared CJK
    (cp >= 0x1f232 && cp <= 0x1f23a) || // Squared CJK
    (cp >= 0x1f250 && cp <= 0x1f251) || // Circled ideograph
    (cp >= 0x1f300 && cp <= 0x1f9ff) || // Miscellaneous Symbols and Pictographs + Emoticons + Transport + Supplemental
    (cp >= 0x1fa00 && cp <= 0x1fa6f) || // Chess Symbols, Extended-A
    (cp >= 0x1fa70 && cp <= 0x1faff) || // Symbols and Pictographs Extended-A
    (cp >= 0x1fb00 && cp <= 0x1fbff) || // Symbols for Legacy Computing
    (cp >= 0x20000 && cp <= 0x2fffd) || // CJK Unified Ideographs Extension B-F
    (cp >= 0x30000 && cp <= 0x3fffd)    // CJK Unified Ideographs Extension G+
  ) {
    return 2;
  }

  return 1;
}

/**
 * Calculate the visible width of a string in terminal columns.
 * Strips ANSI escape sequences and accounts for wide characters.
 */
export function visibleWidth(str: string): number {
  let width = 0;
  let i = 0;
  while (i < str.length) {
    // Skip ANSI escape sequences
    if (str.charCodeAt(i) === 0x1b) {
      // CSI sequence: ESC [ ... letter
      if (i + 1 < str.length && str.charCodeAt(i + 1) === 0x5b) {
        i += 2;
        while (i < str.length && str.charCodeAt(i) >= 0x20 && str.charCodeAt(i) <= 0x3f) i++;
        if (i < str.length) i++; // skip final byte
        continue;
      }
      // OSC sequence: ESC ] ... (BEL or ST)
      if (i + 1 < str.length && str.charCodeAt(i + 1) === 0x5d) {
        i += 2;
        while (i < str.length) {
          if (str.charCodeAt(i) === 0x07) { i++; break; } // BEL
          if (str.charCodeAt(i) === 0x1b && i + 1 < str.length && str.charCodeAt(i + 1) === 0x5c) { i += 2; break; } // ST
          i++;
        }
        continue;
      }
      // Other escape: skip ESC + next char
      i += 2;
      continue;
    }

    // Handle tab
    if (str.charCodeAt(i) === 0x09) {
      width += 8 - (width % 8);
      i++;
      continue;
    }

    // Get code point (handle surrogate pairs)
    const cp = str.codePointAt(i)!;
    width += charWidth(cp);
    i += cp > 0xffff ? 2 : 1;
  }
  return width;
}
