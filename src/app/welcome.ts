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
import { PRODUCT_TAGLINE_HEADLINE } from "../meta/product.js";
import { ctp } from "../tui/themes/default.js";
import { bold } from "../tui/core/ansi.js";

/**
 * Below this width the box-drawing layout looks cramped (the card
 * borders eat too much horizontal real estate), so we fall back to a
 * plain-text version that uses the same palette without the box.
 */
const NARROW_FALLBACK_WIDTH = 50;

const EXAMPLE_PROMPT = `Try: "create hello.ts with a hello function"`;
const HINT_LINE = `Or:  /help to see commands`;

/** Build the welcome banner content, freshly computed for current terminal width. */
export function buildWelcomeContent(): string {
  const termWidth = process.stdout.columns ?? 80;
  const titleText = `OpenPawl v${VERSION}`;
  const taglineText = PRODUCT_TAGLINE_HEADLINE;

  if (termWidth < NARROW_FALLBACK_WIDTH) {
    // No-box plain-text fallback — same content, no border decoration
    // so each line fits comfortably in <50-column terminals.
    return [
      "",
      bold(ctp.mauve(titleText)),
      ctp.subtext0(taglineText),
      "",
      ctp.green(EXAMPLE_PROMPT),
      ctp.subtext1(HINT_LINE),
      "",
    ].join("\n");
  }

  // Inner width of the card = longest content line + 2 spaces left pad
  // + 2 spaces right pad. Borders sit just outside the inner area.
  const innerWidth = Math.max(titleText.length, taglineText.length) + 4;
  const top = ctp.overlay0(`╭${"─".repeat(innerWidth)}╮`);
  const bottom = ctp.overlay0(`╰${"─".repeat(innerWidth)}╯`);
  const padLine = (content: string, visibleLen: number): string => {
    const rightPad = " ".repeat(Math.max(0, innerWidth - 2 - visibleLen));
    return `${ctp.overlay0("│")}  ${content}${rightPad}${ctp.overlay0("│")}`;
  };

  return [
    "",
    top,
    padLine(bold(ctp.mauve(titleText)), titleText.length),
    padLine(ctp.subtext0(taglineText), taglineText.length),
    bottom,
    "",
    ctp.green(EXAMPLE_PROMPT),
    ctp.subtext1(HINT_LINE),
    "",
  ].join("\n");
}
