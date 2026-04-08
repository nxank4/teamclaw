/**
 * ANSI escape code helpers — pure functions, zero dependencies.
 * All functions return strings containing ANSI escape sequences.
 */

// CSI (Control Sequence Introducer) builder
export const csi = (code: string): string => `\x1b[${code}`;

// SGR (Select Graphic Rendition) — styling
export const sgr = (...codes: number[]): string => `\x1b[${codes.join(";")}m`;
export const reset = "\x1b[0m";

// Text attributes — each wraps text with attribute on/off
export const bold = (s: string): string => `\x1b[1m${s}\x1b[22m`;
export const dim = (s: string): string => `\x1b[2m${s}\x1b[22m`;
export const italic = (s: string): string => `\x1b[3m${s}\x1b[23m`;
export const underline = (s: string): string => `\x1b[4m${s}\x1b[24m`;
export const strikethrough = (s: string): string => `\x1b[9m${s}\x1b[29m`;
export const inverse = (s: string): string => `\x1b[7m${s}\x1b[27m`;

// 24-bit true color — returns a styling function
export const rgb = (r: number, g: number, b: number) =>
  (s: string): string => `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m`;
export const bgRgb = (r: number, g: number, b: number) =>
  (s: string): string => `\x1b[48;2;${r};${g};${b}m${s}\x1b[49m`;

// 256-color palette
export const color256 = (n: number) =>
  (s: string): string => `\x1b[38;5;${n}m${s}\x1b[39m`;
export const bgColor256 = (n: number) =>
  (s: string): string => `\x1b[48;5;${n}m${s}\x1b[49m`;

// Standard 16 colors (foreground)
export const black = (s: string): string => `\x1b[30m${s}\x1b[39m`;
export const red = (s: string): string => `\x1b[31m${s}\x1b[39m`;
export const green = (s: string): string => `\x1b[32m${s}\x1b[39m`;
export const yellow = (s: string): string => `\x1b[33m${s}\x1b[39m`;
export const blue = (s: string): string => `\x1b[34m${s}\x1b[39m`;
export const magenta = (s: string): string => `\x1b[35m${s}\x1b[39m`;
export const cyan = (s: string): string => `\x1b[36m${s}\x1b[39m`;
export const white = (s: string): string => `\x1b[37m${s}\x1b[39m`;
export const gray = (s: string): string => `\x1b[90m${s}\x1b[39m`;

// OSC 8 hyperlinks
export const link = (url: string, text: string): string =>
  `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;

// Cursor movement
export const cursorTo = (row: number, col: number): string => `\x1b[${row};${col}H`;
export const cursorUp = (n: number): string => n > 0 ? `\x1b[${n}A` : "";
export const cursorDown = (n: number): string => n > 0 ? `\x1b[${n}B` : "";
export const cursorForward = (n: number): string => n > 0 ? `\x1b[${n}C` : "";
export const cursorBack = (n: number): string => n > 0 ? `\x1b[${n}D` : "";
export const saveCursor = "\x1b[s";
export const restoreCursor = "\x1b[u";

// Clear
export const clearLine = "\x1b[2K";
export const clearToEnd = "\x1b[0K";
export const clearDown = "\x1b[0J";
export const clearScreen = "\x1b[2J";

// Cursor visibility
export const hideCursor = "\x1b[?25l";
export const showCursor = "\x1b[?25h";

// Synchronized output (CSI 2026) — prevents flicker
export const syncStart = "\x1b[?2026h";
export const syncEnd = "\x1b[?2026l";

// Bracketed paste mode
export const bracketedPasteOn = "\x1b[?2004h";
export const bracketedPasteOff = "\x1b[?2004l";
