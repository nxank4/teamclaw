/**
 * Theme engine — singleton that manages the active palette and emits
 * theme:changed events.
 *
 * Default palette: pawlwinkle.
 */
import { EventEmitter } from "node:events";
import type { Palette } from "./semantic-tokens.js";
import { getBuiltInPalettes, DEFAULT_PALETTE_ID, getPaletteById } from "./palettes/index.js";
import { setActivePalette } from "./active.js";

export class ThemeEngine extends EventEmitter {
  private palettes = new Map<string, Palette>();
  private currentId: string;

  constructor() {
    super();
    for (const p of getBuiltInPalettes()) {
      this.palettes.set(p.id, p);
    }
    this.currentId = DEFAULT_PALETTE_ID;
    setActivePalette(this.palettes.get(DEFAULT_PALETTE_ID)!);
  }

  /** Switch the active palette by id. Returns false if the id is unknown. */
  switchTheme(themeId: string): boolean {
    const palette = this.palettes.get(themeId);
    if (!palette) return false;
    this.currentId = themeId;
    setActivePalette(palette);
    this.emit("theme:changed", themeId);
    return true;
  }

  /** The id of the currently active palette. */
  getCurrentId(): string {
    return this.currentId;
  }

  /** Look up a palette by id (used by `/themes` preview). */
  getPalette(themeId: string): Palette | undefined {
    return this.palettes.get(themeId) ?? getPaletteById(themeId);
  }

  /** All known palettes in registration order. */
  listPalettes(): readonly Palette[] {
    return [...this.palettes.values()];
  }
}

let _engine: ThemeEngine | null = null;

export function getThemeEngine(): ThemeEngine {
  if (!_engine) _engine = new ThemeEngine();
  return _engine;
}

export function resetThemeEngine(): void {
  _engine = null;
}
