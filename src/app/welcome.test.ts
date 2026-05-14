/**
 * Welcome banner — Option C card layout.
 *
 * Pin the contract that the launch welcome is intentionally minimal:
 * version + headline + a single example prompt + a single /help
 * pointer. The slash-command and agent-mention list lived here before
 * Prompt 9; it now lives in /help so first-time users are not greeted
 * by a wall of metadata.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { buildWelcomeContent } from "./welcome.js";
import { VERSION } from "../version.js";
import { PRODUCT_TAGLINE_SHORT } from "../meta/product.js";
import { stripAnsi } from "../tui/utils/text-width.js";

const ORIGINAL_COLUMNS = process.stdout.columns;

function setColumns(cols: number): void {
  Object.defineProperty(process.stdout, "columns", {
    value: cols,
    configurable: true,
    writable: true,
  });
}

describe("buildWelcomeContent — Option C card layout", () => {
  beforeEach(() => setColumns(80));
  afterEach(() => setColumns(ORIGINAL_COLUMNS ?? 80));

  it("includes the version string read from version.ts", () => {
    const out = stripAnsi(buildWelcomeContent());
    expect(out).toContain(`OpenPawl v${VERSION}`);
  });

  it("includes the example prompt with a 'Try:' prefix", () => {
    const out = stripAnsi(buildWelcomeContent());
    expect(out).toContain("Try:");
    // Example must be a stable, copy-paste-able prompt.
    expect(out).toContain('"create hello.ts with a hello function"');
  });

  it("does NOT list the slash commands or agent mentions that moved to /help", () => {
    const out = stripAnsi(buildWelcomeContent());
    // Anything from the old multi-row list must be gone — the only
    // /-prefixed token allowed is the /help pointer in the hint line.
    expect(out).not.toContain("/settings");
    expect(out).not.toContain("/agents");
    expect(out).not.toContain("@coder");
    expect(out).not.toContain("@reviewer");
    expect(out).not.toContain("@planner");
    expect(out).not.toContain("@tester");
    expect(out).not.toContain("@debugger");
    // The pointer to /help survives because it is the user's path
    // back to the full surface.
    expect(out).toContain("/help");
  });

  it("falls back to a no-box plain-text layout when the terminal is narrower than 50 cols", () => {
    setColumns(40);
    const out = stripAnsi(buildWelcomeContent());
    // No box-drawing characters in narrow mode — content is left-flush.
    expect(out).not.toContain("╭");
    expect(out).not.toContain("╰");
    expect(out).not.toContain("│");
    // Same content, just unboxed.
    expect(out).toContain(`OpenPawl v${VERSION}`);
    expect(out).toContain("Try:");
    expect(out).toContain("/help");
  });

  it("uses box-drawing characters at standard terminal widths", () => {
    setColumns(80);
    const out = stripAnsi(buildWelcomeContent());
    expect(out).toContain("╭");
    expect(out).toContain("╰");
    expect(out).toContain("│");
  });

  it("renders PRODUCT_TAGLINE_SHORT in the card body at standard widths", () => {
    setColumns(80);
    const out = stripAnsi(buildWelcomeContent());
    expect(out).toContain(PRODUCT_TAGLINE_SHORT);
  });

  it("renders PRODUCT_TAGLINE_SHORT in the narrow-terminal fallback", () => {
    setColumns(40);
    const out = stripAnsi(buildWelcomeContent());
    expect(out).toContain(PRODUCT_TAGLINE_SHORT);
  });
});
