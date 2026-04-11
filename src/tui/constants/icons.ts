/**
 * Single source of truth for all Unicode symbols used across the TUI.
 * Import ICONS instead of hardcoding Unicode literals.
 */

export const ICONS = {
  // Status indicators
  success: "\u2713",     // ✓
  error: "\u2717",       // ✗
  warning: "\u26a0",     // ⚠

  // Navigation / pointers
  cursor: "\u25b8",      // ▸
  expand: "\u25be",      // ▾
  arrow: "\u2192",       // →
  arrowLeft: "\u2190",   // ←
  arrowUp: "\u2191",     // ↑
  arrowDown: "\u2193",   // ↓

  // Shapes
  diamond: "\u25c6",     // ◆
  bullet: "\u2022",      // •
  block: "\u2588",       // █

  // Scroll indicators
  scrollUp: "\u25b2",    // ▲
  scrollDown: "\u25bc",  // ▼

  // Mode icons
  bolt: "\u26a1",        // ⚡
  planMode: "\u25a3",    // ▣
  reviewMode: "\u25ce",  // ◎

  // Misc
  hourglass: "\u23f3",   // ⏳
  memo: "\ud83d\udcdd",  // 📝
  gear: "\u2699",        // ⚙
} as const;

export type IconKey = keyof typeof ICONS;
