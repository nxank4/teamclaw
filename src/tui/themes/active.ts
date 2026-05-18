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
import { invalidateCache } from "./resolver.js";

let _activePalette: Palette | null = null;

export function setActivePalette(palette: Palette): void {
  _activePalette = palette;
  invalidateCache();
}

/**
 * Read the active palette. Throws if no palette has been set yet —
 * this should only happen if a token is read before app startup wires
 * the theme engine.
 */
export function activePalette(): Palette {
  if (!_activePalette) {
    throw new Error("No active palette set. Theme engine must initialize before tokens are read.");
  }
  return _activePalette;
}

/** True if a palette has been set. Used by guarded callsites in startup. */
export function hasActivePalette(): boolean {
  return _activePalette !== null;
}
