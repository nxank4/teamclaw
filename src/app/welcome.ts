/**
 * Welcome banner content builder — Option C card layout.
 *
 * The previous banner listed every slash command and agent mention,
 * so first-time users were greeted with a wall of metadata before
 * they had any context for it. Option C trims that to a small card
 * (version + headline) plus two pointer lines: an example prompt
 * they can copy-paste, and a /help reference for everything else.
 * The full command surface lives in /help — the welcome only
 * surfaces what gets a new user productive in the first 30 seconds.
 */

import { VERSION } from "../version.js";
import { PRODUCT_TAGLINE_SHORT } from "../meta/product.js";
import { tokens } from "../tui/themes/tokens.js";
import { bold } from "../tui/core/ansi.js";

/**
 * Below this width the box-drawing layout looks cramped (the card
 * borders eat too much horizontal real estate), so we fall back to a
 * plain-text version that uses the same palette without the box.
 */
const NARROW_FALLBACK_WIDTH = 50;

const EXAMPLE_PROMPT = `Try: "create hello.ts with a hello function"`;
const HINT_LINE = `Or:  /help to see commands · --sessions to resume a past session`;

/** Build the welcome banner content, freshly computed for current terminal width. */
export function buildWelcomeContent(): string {
  const termWidth = process.stdout.columns ?? 80;
  const titleText = `OpenPawl v${VERSION}`;
  const taglineText = PRODUCT_TAGLINE_SHORT;

  if (termWidth < NARROW_FALLBACK_WIDTH) {
    // No-box plain-text fallback — same content, no border decoration
    // so each line fits comfortably in <50-column terminals.
    return [
      "",
      bold(tokens.ui.welcomeTitle(titleText)),
      tokens.ui.welcomeTagline(taglineText),
      "",
      tokens.ui.welcomeExample(EXAMPLE_PROMPT),
      tokens.ui.welcomeHint(HINT_LINE),
      "",
    ].join("\n");
  }

  // Inner width of the card = longest content line + 2 spaces left pad
  // + 2 spaces right pad. Borders sit just outside the inner area.
  const innerWidth = Math.max(titleText.length, taglineText.length) + 4;
  const top = tokens.ui.welcomeBorder(`╭${"─".repeat(innerWidth)}╮`);
  const bottom = tokens.ui.welcomeBorder(`╰${"─".repeat(innerWidth)}╯`);
  const padLine = (content: string, visibleLen: number): string => {
    const rightPad = " ".repeat(Math.max(0, innerWidth - 2 - visibleLen));
    return `${tokens.ui.welcomeBorder("│")}  ${content}${rightPad}${tokens.ui.welcomeBorder("│")}`;
  };

  return [
    "",
    top,
    padLine(bold(tokens.ui.welcomeTitle(titleText)), titleText.length),
    padLine(tokens.ui.welcomeTagline(taglineText), taglineText.length),
    bottom,
    "",
    tokens.ui.welcomeExample(EXAMPLE_PROMPT),
    tokens.ui.welcomeHint(HINT_LINE),
    "",
  ].join("\n");
}
