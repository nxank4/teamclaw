/**
 * A styling function that wraps a string with ANSI codes.
 * Lives in its own file so resolver/fallback/tokens don't pull in the
 * legacy `Theme` interface from theme.ts (which is slated for deletion).
 */
export type StyleFn = (s: string) => string;
