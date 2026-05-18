/**
 * Built-in palette registry.
 *
 * Listed in display order. The first entry is the project default for
 * users without an explicit `uiTheme` in their global config.
 */
import type { Palette, PaletteId } from "../semantic-tokens.js";
import { pawlwinkle } from "./pawlwinkle.js";
import { pawlbon } from "./pawlbon.js";
import { catppuccinMocha } from "./catppuccin-mocha.js";

export { pawlwinkle, pawlbon, catppuccinMocha };

export function getBuiltInPalettes(): readonly Palette[] {
  return [pawlwinkle, pawlbon, catppuccinMocha];
}

export const DEFAULT_PALETTE_ID: PaletteId = "pawlwinkle";

/** Brief descriptions surfaced by `/themes`. */
export const PALETTE_DESCRIPTIONS: Record<PaletteId, string> = {
  "pawlwinkle":       "soft periwinkle for calm long sessions",
  "pawlbon":          "high-contrast sharp palette for power users",
  "catppuccin-mocha": "legacy default",
};

export function getPaletteById(id: string): Palette | undefined {
  return getBuiltInPalettes().find((p) => p.id === id);
}
