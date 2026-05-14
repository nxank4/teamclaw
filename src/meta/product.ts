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

/**
 * Card-friendly headline for the launch welcome banner — short enough
 * to keep the boxed layout compact on standard terminal widths. Keep
 * this distinct from PRODUCT_TAGLINE_SHORT, which is still the source
 * of truth for README / --help / onboarding intro.
 */
export const PRODUCT_TAGLINE_HEADLINE = "Crew AI for your terminal";
