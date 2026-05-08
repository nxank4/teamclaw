/**
 * Single source of truth for all Unicode symbols used across the TUI.
 * Import ICONS instead of hardcoding Unicode literals.
 */

export const ICONS = {
  // Status indicators
  success: "✓",     // ✓
  error: "✗",       // ✗
  warning: "⚠",     // ⚠

  // Navigation / pointers
  cursor: "▸",      // ▸
  expand: "▾",      // ▾
  arrow: "→",       // →
  arrowLeft: "←",   // ←
  arrowUp: "↑",     // ↑
  arrowDown: "↓",   // ↓

  // Shapes
  diamond: "◆",     // ◆
  bullet: "•",      // •
  block: "█",       // █

  // Dots (status indicators)
  dotFilled: "●",   // ●
  dotEmpty: "○",    // ○
  dotHalf: "◐",     // ◐

  // Scroll indicators
  scrollUp: "▲",    // ▲
  scrollDown: "▼",  // ▼

  // Mode icons (solo/crew)
  bolt: "⚡",               // ⚡
  modeSolo: "›",           // ›
  modeCrew: "⚡",           // ⚡

  // Spinners
  spinnerFrames: ["◒", "◐", "◓", "◑"] as readonly string[], // ◒ ◐ ◓ ◑
  brailleFrames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as readonly string[],
  // ⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏

  // Canonical 4-frame box spinner — single source of truth for every
  // animated indicator. ThinkingIndicator (top-level) and the inline
  // tree-node spinner both render from this set so the user never
  // sees two glyph styles spinning side-by-side at different paces.
  boxFrames: ["❏", "❐", "❑", "❒"] as readonly string[],
  // ❏ ❐ ❑ ❒

  // Misc
  aborted: "◼",     // ◼
  hourglass: "⏳",   // ⏳
  memo: "📝",  // 📝
  gear: "⚙",        // ⚙
} as const;

export type IconKey = keyof typeof ICONS;
