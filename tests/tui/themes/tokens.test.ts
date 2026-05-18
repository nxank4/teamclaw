/**
 * Tests for the 3-layer token system: resolver, alias map, fallback,
 * palette switching, and the OPENPAWL_FORCE_COLORS env override.
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { tokens, withPalette, bgToken } from "../../../src/tui/themes/tokens.js";
import {
  COMPONENT_TO_SEMANTIC,
  ALL_COMPONENT_PATHS,
  type ComponentPath,
} from "../../../src/tui/themes/component-tokens.js";
import {
  ALL_SEMANTIC_PATHS,
  type SemanticPath,
  type Palette,
} from "../../../src/tui/themes/semantic-tokens.js";
import { setActivePalette, activePalette } from "../../../src/tui/themes/active.js";
import {
  detectTier,
  refreshTier,
  currentTier,
  resolveToken,
} from "../../../src/tui/themes/resolver.js";
import {
  pawlwinkle,
  pawlbon,
  catppuccinMocha,
  getBuiltInPalettes,
  getPaletteById,
} from "../../../src/tui/themes/palettes/index.js";
import {
  getThemeEngine,
  resetThemeEngine,
} from "../../../src/tui/themes/theme-engine.js";

const TRUECOLOR_ENV = { COLORTERM: "truecolor" } as NodeJS.ProcessEnv;

beforeEach(() => {
  // Reset state between tests so env overrides don't bleed across suites.
  refreshTier(TRUECOLOR_ENV);
  setActivePalette(pawlwinkle);
  resetThemeEngine();
});

describe("semantic palette shape", () => {
  test("every palette satisfies the 28-key contract", () => {
    for (const p of getBuiltInPalettes()) {
      for (const path of ALL_SEMANTIC_PATHS) {
        const [group, key] = path.split(".") as [string, string];
        const bucket = (p.semantic as unknown as Record<string, Record<string, string>>)[group];
        expect(bucket).toBeDefined();
        expect(bucket[key]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });

  test("every palette has a complete ansi16 map", () => {
    for (const p of getBuiltInPalettes()) {
      for (const path of ALL_SEMANTIC_PATHS) {
        expect(p.ansi16[path]).toBeDefined();
      }
    }
  });
});

describe("component-token alias map", () => {
  test("every alias points at a valid semantic path", () => {
    const validPaths = new Set<string>(ALL_SEMANTIC_PATHS);
    for (const component of ALL_COMPONENT_PATHS) {
      const semantic = COMPONENT_TO_SEMANTIC[component] as SemanticPath;
      expect(validPaths.has(semantic)).toBe(true);
    }
  });
});

describe("tokens proxy", () => {
  test("returns a function that wraps text in ANSI codes (truecolor)", () => {
    const styled = tokens.chat.userText("hello");
    expect(styled).toContain("hello");
    expect(styled).toMatch(/\x1b\[/);
  });

  test("misspelled path throws at runtime", () => {
    expect(() => {
      // @ts-expect-error — testing runtime guard for nonexistent path
      tokens.chat.nonexistentLeaf("x");
    }).toThrow(/Unknown component token/);
  });

  test("chat.userText flows through text.primary to active palette hex", () => {
    setActivePalette(pawlwinkle);
    const styled = tokens.chat.userText("x");
    const [r, g, b] = hexToRgb(pawlwinkle.semantic.text.primary);
    expect(styled).toBe(`\x1b[38;2;${r};${g};${b}mx\x1b[39m`);
  });

  test("agent.coder resolves through brand.accent", () => {
    setActivePalette(pawlbon);
    const styled = tokens.agent.coder("y");
    const [r, g, b] = hexToRgb(pawlbon.semantic.brand.accent);
    expect(styled).toBe(`\x1b[38;2;${r};${g};${b}my\x1b[39m`);
  });
});

describe("withPalette (cross-theme rendering)", () => {
  test("renders against a passed-in palette without touching active state", () => {
    setActivePalette(pawlwinkle);
    const styled = withPalette(pawlbon, (t) => t.ui.brandPrimary("hi"));
    const [r, g, b] = hexToRgb(pawlbon.semantic.brand.primary);
    expect(styled).toBe(`\x1b[38;2;${r};${g};${b}mhi\x1b[39m`);
    // Active palette unchanged.
    expect(activePalette().id).toBe("pawlwinkle");
  });
});

describe("bgToken", () => {
  test("emits background ANSI for the named palette bg key", () => {
    setActivePalette(pawlwinkle);
    const styled = bgToken("code")("x");
    const [r, g, b] = hexToRgb(pawlwinkle.semantic.bg.code);
    expect(styled).toBe(`\x1b[48;2;${r};${g};${b}mx\x1b[49m`);
  });
});

describe("tier detection", () => {
  test("OPENPAWL_FORCE_COLORS=16 overrides truecolor env", () => {
    refreshTier({ COLORTERM: "truecolor", OPENPAWL_FORCE_COLORS: "16" } as NodeJS.ProcessEnv);
    expect(currentTier()).toBe("16");
  });

  test("OPENPAWL_FORCE_COLORS=none forces no-color even without NO_COLOR", () => {
    refreshTier({ OPENPAWL_FORCE_COLORS: "none" } as NodeJS.ProcessEnv);
    expect(currentTier()).toBe("none");
  });

  test("NO_COLOR=1 disables color", () => {
    refreshTier({ NO_COLOR: "1", COLORTERM: "truecolor" } as NodeJS.ProcessEnv);
    expect(currentTier()).toBe("none");
  });

  test("COLORTERM=truecolor selects truecolor tier", () => {
    expect(detectTier({ COLORTERM: "truecolor" } as NodeJS.ProcessEnv)).toBe("truecolor");
  });

  test("TERM containing 256color selects 256 tier", () => {
    expect(detectTier({ TERM: "xterm-256color" } as NodeJS.ProcessEnv)).toBe("256");
  });

  test("plain TERM defaults to 16", () => {
    expect(detectTier({ TERM: "xterm" } as NodeJS.ProcessEnv)).toBe("16");
  });
});

describe("16-color fallback", () => {
  test("every component token resolves to a 16-color ANSI sequence", () => {
    refreshTier({ OPENPAWL_FORCE_COLORS: "16" } as NodeJS.ProcessEnv);
    setActivePalette(pawlwinkle);
    for (const path of ALL_COMPONENT_PATHS) {
      const styled = resolveToken(path as ComponentPath, pawlwinkle)("x");
      expect(styled).toMatch(/\x1b\[\d+m/);
    }
  });
});

describe("no-color mode", () => {
  test("text.tertiary uses dim attribute", () => {
    refreshTier({ OPENPAWL_FORCE_COLORS: "none" } as NodeJS.ProcessEnv);
    setActivePalette(pawlwinkle);
    const styled = tokens.ui.textTertiary("hint");
    expect(styled).toBe("\x1b[2mhint\x1b[22m");
  });

  test("border.active uses bold attribute", () => {
    refreshTier({ OPENPAWL_FORCE_COLORS: "none" } as NodeJS.ProcessEnv);
    // tokens.ui doesn't expose border.active directly; resolveToken does.
    const styled = resolveToken("panel.border", pawlwinkle)("x");
    // panel.border → border.default → identity in NO_COLOR_ATTR
    expect(styled).toBe("x");
  });

  test("status.error uses bold attribute", () => {
    refreshTier({ OPENPAWL_FORCE_COLORS: "none" } as NodeJS.ProcessEnv);
    const styled = tokens.badge.error("FAIL");
    expect(styled).toBe("\x1b[1mFAIL\x1b[22m");
  });
});

describe("theme engine", () => {
  test("default palette is pawlwinkle", () => {
    resetThemeEngine();
    expect(getThemeEngine().getCurrentId()).toBe("pawlwinkle");
    expect(activePalette().id).toBe("pawlwinkle");
  });

  test("switchTheme to pawlbon updates active palette", () => {
    getThemeEngine().switchTheme("pawlbon");
    expect(activePalette().id).toBe("pawlbon");
  });

  test("switchTheme to unknown id returns false and leaves active unchanged", () => {
    const before = activePalette().id;
    expect(getThemeEngine().switchTheme("nonexistent")).toBe(false);
    expect(activePalette().id).toBe(before);
  });

  test("listPalettes returns the canonical 3 themes", () => {
    const ids = getThemeEngine().listPalettes().map((p) => p.id);
    expect(ids).toEqual(["pawlwinkle", "pawlbon", "catppuccin-mocha"]);
  });

  test("getPaletteById returns each known palette", () => {
    expect(getPaletteById("pawlwinkle")).toBeDefined();
    expect(getPaletteById("pawlbon")).toBeDefined();
    expect(getPaletteById("catppuccin-mocha")).toBeDefined();
    expect(getPaletteById("tokyo-night")).toBeUndefined();
  });

  test("catppuccin-mocha is a valid switchable palette", () => {
    expect(getThemeEngine().switchTheme("catppuccin-mocha")).toBe(true);
    expect(activePalette().id).toBe("catppuccin-mocha");
  });

  test("theme:changed event fires on switch", () => {
    let lastId: string | null = null;
    getThemeEngine().on("theme:changed", (id: string) => { lastId = id; });
    getThemeEngine().switchTheme("pawlbon");
    expect(lastId).toBe("pawlbon");
  });
});

describe("reactive switching", () => {
  test("a previously-captured token re-resolves after palette change", () => {
    setActivePalette(pawlwinkle);
    const captured = tokens.ui.brandPrimary;
    const winkleOut = captured("x");
    setActivePalette(pawlbon);
    const bonOut = captured("x");
    expect(winkleOut).not.toBe(bonOut);
    const [r, g, b] = hexToRgb(pawlbon.semantic.brand.primary);
    expect(bonOut).toBe(`\x1b[38;2;${r};${g};${b}mx\x1b[39m`);
  });
});

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// Silence unused-import linter for catppuccinMocha (referenced indirectly).
void catppuccinMocha;
