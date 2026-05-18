/**
 * Token resolver — turns a component-token path into a StyleFn for the
 * current terminal tier, against a given palette.
 *
 * Tier is detected once at module load from environment, with an explicit
 * OPENPAWL_FORCE_COLORS override for testing and weird terminals.
 *
 * StyleFns are memoized per (paletteId, componentPath) since render hot
 * paths hit the same tokens thousands of times per frame. The cache is
 * invalidated externally by callers that swap palettes (see tokens.ts).
 */
import type { StyleFn } from "./style-fn.js";
import type { ComponentPath } from "./component-tokens.js";
import { COMPONENT_TO_SEMANTIC } from "./component-tokens.js";
import type { Palette, SemanticPath } from "./semantic-tokens.js";
import { getHex, ThemePaletteError } from "./semantic-tokens.js";
import { ANSI16_FN, NO_COLOR_ATTR } from "./fallback.js";

export type Tier = "truecolor" | "256" | "16" | "none";

// ── tier detection ─────────────────────────────────────────────────

function parseOverride(value: string): Tier | null {
  switch (value.toLowerCase()) {
    case "truecolor": case "24bit": return "truecolor";
    case "256":                     return "256";
    case "16":                      return "16";
    case "none": case "0": case "no": return "none";
    default:                        return null;
  }
}

export function detectTier(env: NodeJS.ProcessEnv = process.env): Tier {
  const override = env.OPENPAWL_FORCE_COLORS;
  if (override) {
    const parsed = parseOverride(override);
    if (parsed) return parsed;
  }
  if (env.NO_COLOR !== undefined) return "none";
  const ct = env.COLORTERM?.toLowerCase();
  if (ct === "truecolor" || ct === "24bit") return "truecolor";
  if (env.TERM?.includes("256color")) return "256";
  return "16";
}

let _currentTier: Tier = detectTier();

/** Re-detect tier. Call from tests; not normally needed at runtime. */
export function refreshTier(env?: NodeJS.ProcessEnv): void {
  _currentTier = detectTier(env);
  _cache.clear();
}

export function currentTier(): Tier {
  return _currentTier;
}

// ── color helpers ──────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length !== 6) throw new Error(`Invalid hex color: ${hex}`);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function fgTrue(hex: string): StyleFn {
  const [r, g, b] = hexToRgb(hex);
  return (s) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m`;
}

/**
 * Quantize an RGB triple to the xterm 256-color cube.
 * Cube index is 16 + 36*r + 6*g + b where r/g/b ∈ [0,5].
 */
function rgbToXterm256(r: number, g: number, b: number): number {
  // Match against grayscale ramp first — closer match for near-gray hex values.
  if (Math.abs(r - g) < 8 && Math.abs(g - b) < 8) {
    const gray = Math.round(((r + g + b) / 3 - 8) / 10);
    if (gray >= 0 && gray <= 23) return 232 + gray;
  }
  const q = (c: number) => Math.round(c / 51);
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

function fg256(hex: string): StyleFn {
  const [r, g, b] = hexToRgb(hex);
  const idx = rgbToXterm256(r, g, b);
  return (s) => `\x1b[38;5;${idx}m${s}\x1b[39m`;
}

// ── memoization ────────────────────────────────────────────────────

const _cache = new Map<string, StyleFn>();

function cacheKey(paletteId: string, path: ComponentPath): string {
  return `${paletteId}:${path}`;
}

/** Drop memoized StyleFns. Called when active palette changes. */
export function invalidateCache(): void {
  _cache.clear();
}

// ── resolution ─────────────────────────────────────────────────────

/**
 * Resolve a component token against a specific palette.
 * Pure: does not consult the active palette state.
 */
export function resolveToken(path: ComponentPath, palette: Palette): StyleFn {
  const key = cacheKey(palette.id, path);
  const cached = _cache.get(key);
  if (cached) return cached;

  const semantic = COMPONENT_TO_SEMANTIC[path] as SemanticPath;
  const fn = build(semantic, palette);
  _cache.set(key, fn);
  return fn;
}

function build(semantic: SemanticPath, palette: Palette): StyleFn {
  switch (_currentTier) {
    case "none":
      return NO_COLOR_ATTR[semantic];
    case "16": {
      const colorName = palette.ansi16[semantic];
      if (!colorName) throw new ThemePaletteError(palette.id, `ansi16.${semantic}`);
      return ANSI16_FN[colorName];
    }
    case "256":
      return fg256(getHex(palette.semantic, semantic));
    case "truecolor":
      return fgTrue(getHex(palette.semantic, semantic));
  }
}
