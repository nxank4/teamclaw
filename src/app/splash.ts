/**
 * Splash screen — animated paw logo displayed on launch.
 * Falls back to minimal version on small terminals.
 */
import type { Terminal } from "../tui/core/terminal.js";
import type { Theme } from "../tui/themes/theme.js";
import { visibleWidth } from "../tui/utils/text-width.js";

// ── ASCII art (exact copy from spec) ──────────────────────

const BORDER_TOP    = "    \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557";
const BORDER_BOTTOM = "    \u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d";
const BORDER_EMPTY  = "    \u2551                                      \u2551";

const LOGO_LINES = [
  "    \u2551         \u2588\u2588\u2588\u2588                         \u2551",
  "    \u2551         \u2588\u2588\u2588\u2588\u2588\u2588        \u2588\u2588\u2588\u2588\u2588\u2588\u2588        \u2551",
  "    \u2551           \u2588\u2588\u2588\u2588\u2588      \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588       \u2551",
  "    \u2551         \u2588\u2588\u2588\u2588\u2588\u2588        \u2588\u2588\u2588\u2588\u2588\u2588\u2588        \u2551",
  "    \u2551         \u2588\u2588\u2588\u2588                         \u2551",
];

const PAD_LINES = [
  "    \u2551                 \u2588\u2588\u2588\u2588                 \u2551",
  "    \u2551                \u2588\u2588\u2588\u2588\u2588\u2588                \u2551",
  "    \u2551                 \u2588\u2588\u2588\u2588                 \u2551",
];

const FULL_LOGO = [
  BORDER_TOP,
  BORDER_EMPTY,
  ...LOGO_LINES,
  BORDER_EMPTY,
  ...PAD_LINES,
  BORDER_EMPTY,
  BORDER_BOTTOM,
];

const TEXT_LINES = [
  "",
  "    \u2726  O P E N P A W L  \u2726",
  "",
  "  \u2500\u2500\u2500 Terminal-native AI workspace \u2500\u2500\u2500",
  "",
  "      \ud83d\udc3e  by Codepawl  \u00b7  v0.1.0",
];

// ── Rendering ─────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function centerCol(text: string, termCols: number): number {
  return Math.max(1, Math.floor((termCols - visibleWidth(text)) / 2));
}

function colorLogo(line: string, theme: Theme): string {
  return line
    .replace(/[\u2554\u2557\u255a\u255d\u2550\u2551]/g, (ch) => theme.logoBorder(ch))
    .replace(/\u2588+/g, (blocks) => theme.logo(blocks));
}

/**
 * Render the full splash screen with line-by-line fade-in.
 * Skips to minimal version on small terminals.
 */
export async function renderSplash(
  terminal: Terminal,
  theme: Theme,
): Promise<void> {
  const rows = terminal.rows;
  const cols = terminal.columns;

  // Clear screen and hide cursor
  terminal.write("\x1b[2J\x1b[H");
  terminal.write("\x1b[?25l");

  if (cols < 50 || rows < 22) {
    renderMinimalSplash(terminal, theme);
    return;
  }

  const allLines = [...FULL_LOGO, ...TEXT_LINES];
  const totalHeight = allLines.length;
  const startRow = Math.max(1, Math.floor((rows - totalHeight) / 2));

  // Phase 1: Draw border + logo line by line
  for (let i = 0; i < FULL_LOGO.length; i++) {
    const line = FULL_LOGO[i]!;
    const col = centerCol(line, cols);
    terminal.write(`\x1b[${startRow + i};${col}H`);
    terminal.write(colorLogo(line, theme));
    await sleep(40);
  }

  // Phase 2: Draw text lines
  for (let i = 0; i < TEXT_LINES.length; i++) {
    const line = TEXT_LINES[i]!;
    if (!line.trim()) continue;

    const row = startRow + FULL_LOGO.length + i;
    const col = centerCol(line, cols);
    terminal.write(`\x1b[${row};${col}H`);

    if (line.includes("O P E N P A W L")) {
      terminal.write(theme.bold(theme.logo(line)));
    } else {
      terminal.write(theme.dim(line));
    }
    await sleep(80);
  }

  // Phase 3: Loading dots
  const loadRow = startRow + totalHeight + 2;
  const loadText = "Starting";
  const loadCol = Math.max(1, Math.floor((cols - 20) / 2));

  for (let dots = 0; dots < 3; dots++) {
    terminal.write(`\x1b[${loadRow};${loadCol}H`);
    terminal.write(theme.dim(loadText + ".".repeat(dots + 1)));
    await sleep(300);
  }
}

function renderMinimalSplash(terminal: Terminal, theme: Theme): void {
  const rows = terminal.rows;
  const cols = terminal.columns;
  const centerRow = Math.floor(rows / 2);

  const name = "\u2726  O P E N P A W L  \u2726";
  const tag = "Terminal-native AI workspace";

  const nameCol = centerCol(name, cols);
  const tagCol = centerCol(tag, cols);

  terminal.write(`\x1b[${centerRow};${nameCol}H`);
  terminal.write(theme.bold(theme.logo(name)));
  terminal.write(`\x1b[${centerRow + 1};${tagCol}H`);
  terminal.write(theme.dim(tag));
}

/**
 * Wait for splash to dismiss — either keypress or short timeout.
 */
export async function waitForSplashDismiss(
  terminal: Terminal,
  timeoutMs = 500,
): Promise<void> {
  await Promise.race([
    sleep(timeoutMs),
    new Promise<void>((resolve) => {
      terminal.onInput(() => resolve());
    }),
  ]);
}
