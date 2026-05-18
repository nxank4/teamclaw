/**
 * Theme engine — singleton that manages theme loading, switching, and resolution.
 * Default theme: Catppuccin Mocha.
 */
import { EventEmitter } from "node:events";
import type { Theme } from "./theme.js";
import type { ThemeDefinition } from "./theme-types.js";
import { getBuiltInThemes } from "./built-in/index.js";
import { setActiveTheme } from "./default.js";
import type { Palette } from "./semantic-tokens.js";
import { getBuiltInPalettes, DEFAULT_PALETTE_ID, getPaletteById } from "./palettes/index.js";
import { setActivePalette } from "./active.js";

export class ThemeEngine extends EventEmitter {
  private themes = new Map<string, ThemeDefinition>();
  private palettes = new Map<string, Palette>();
  private current: ThemeDefinition;
  private maxBrightness = 1.0;

  constructor() {
    super();
    // Register legacy Theme definitions (back-compat for old defaultTheme proxy).
    for (const td of getBuiltInThemes()) {
      this.themes.set(td.id, td);
    }
    // Register new Palette definitions for the token system.
    for (const p of getBuiltInPalettes()) {
      this.palettes.set(p.id, p);
    }
    // Legacy default still resolves to mocha (until commit 11 removes it).
    this.current = this.themes.get("catppuccin-mocha")!;
    // Token system default is pawlwinkle.
    const defaultPalette = this.palettes.get(DEFAULT_PALETTE_ID)!;
    setActivePalette(defaultPalette);
  }

  /** Get the currently active theme. */
  getTheme(): Theme {
    return this.current.theme;
  }

  /** Get the current theme definition (with palette). */
  getDefinition(): ThemeDefinition {
    return this.current;
  }

  /** Get the current theme ID. */
  getCurrentId(): string {
    return this.current.id;
  }

  /** Switch to a different theme by ID. Updates legacy + new token systems. */
  switchTheme(themeId: string): boolean {
    const td = this.themes.get(themeId);
    if (td) {
      this.current = td;
      setActiveTheme(td.theme);
    }
    const palette = this.palettes.get(themeId);
    if (palette) {
      setActivePalette(palette);
    }
    if (!td && !palette) return false;
    this.emit("theme:changed", themeId);
    return true;
  }

  /** Get the Palette definition for a theme id (used by /themes preview). */
  getPalette(themeId: string): Palette | undefined {
    return this.palettes.get(themeId) ?? getPaletteById(themeId);
  }

  /** List palette ids (the canonical 3-theme registry). */
  listPalettes(): readonly Palette[] {
    return [...this.palettes.values()];
  }

  /** List all available theme IDs. */
  listThemes(): { id: string; name: string; variant: string }[] {
    return [...this.themes.values()].map((t) => ({
      id: t.id,
      name: t.name,
      variant: t.variant,
    }));
  }

  /** Register a custom theme. */
  registerTheme(td: ThemeDefinition): void {
    this.themes.set(td.id, td);
  }

  /** Set max brightness (0.0–1.0). Affects computed colors. */
  setMaxBrightness(value: number): void {
    this.maxBrightness = Math.max(0, Math.min(1, value));
  }

  getMaxBrightness(): number {
    return this.maxBrightness;
  }

  /** Get a theme by ID (for preview). */
  getThemeById(id: string): ThemeDefinition | undefined {
    return this.themes.get(id);
  }
}

/** Singleton instance. */
let _engine: ThemeEngine | null = null;

export function getThemeEngine(): ThemeEngine {
  if (!_engine) _engine = new ThemeEngine();
  return _engine;
}

export function resetThemeEngine(): void {
  _engine = null;
}
