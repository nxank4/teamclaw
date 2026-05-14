/**
 * Product metadata — single source of truth for name and tagline.
 * Anywhere the user sees the tagline (welcome banner, --help header,
 * onboarding intro, CLI help), import from here rather than hardcoding.
 */

export const PRODUCT_NAME = "OpenPawl";

/** Full tagline used in README, long-form help, and the welcome banner. */
export const PRODUCT_TAGLINE_LONG =
  "Plan. Build. Review. Remember. Repeat. Your AI dev team in the terminal.";

/** Short variant for space-constrained slots (package.json, GitHub repo description, header lines). */
export const PRODUCT_TAGLINE_SHORT =
  "Plan. Build. Review. Remember. Repeat.";
