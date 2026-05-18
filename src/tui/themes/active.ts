/**
 * Active palette state.
 *
 * Owns the single mutable reference to the currently-loaded Palette.
 * Components never read this directly — they go through the `tokens`
 * Proxy in tokens.ts, which dereferences the active palette on every
 * call so that mid-session theme switches are transparent.
 *
 * Theme engine calls setActivePalette() on /theme switch; this also
 * invalidates the resolver's StyleFn cache.
 */
import type { Palette } from "./semantic-tokens.js";
import { pawlwinkle } from "./palettes/pawlwinkle.js";
import { invalidateCache } from "./resolver.js";

/**
 * Initial palette is pawlwinkle so token reads work from module load —
 * tests and standalone scripts don't need to construct ThemeEngine.
 * The engine calls setActivePalette() on /theme switch to swap.
 */
let _activePalette: Palette = pawlwinkle;

export function setActivePalette(palette: Palette): void {
  _activePalette = palette;
  invalidateCache();
}

export function activePalette(): Palette {
  return _activePalette;
}
