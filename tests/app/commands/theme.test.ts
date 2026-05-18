import { describe, expect, it, beforeEach, afterAll, beforeAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createThemeCommand, createThemesCommand } from "../../../src/app/commands/theme.js";
import { resetThemeEngine, getThemeEngine } from "../../../src/tui/themes/theme-engine.js";
import { activePalette, setActivePalette } from "../../../src/tui/themes/active.js";
import { pawlwinkle } from "../../../src/tui/themes/palettes/index.js";
import { THEMES_MESSAGE_TAG } from "../../../src/tui/components/themes-preview.js";
import {
  InteractiveBlock,
  _resetActiveBlock,
  type InteractiveBlockSpec,
  type InteractiveBlockDeps,
} from "../../../src/tui/components/interactive-block/index.js";

// Redirect the config path so persistTheme writes to a temp file, not
// the user's real ~/.openpawl/config.json.
const ORIGINAL_CONFIG_PATH = process.env.OPENPAWL_CONFIG_PATH;
let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), "op-theme-cmd-"));
  process.env.OPENPAWL_CONFIG_PATH = join(tempDir, "config.json");
});

afterAll(() => {
  if (ORIGINAL_CONFIG_PATH === undefined) {
    delete process.env.OPENPAWL_CONFIG_PATH;
  } else {
    process.env.OPENPAWL_CONFIG_PATH = ORIGINAL_CONFIG_PATH;
  }
  rmSync(tempDir, { recursive: true, force: true });
});

interface Captured {
  role: string;
  content: string;
  options?: { tag?: string };
}

function makeCtx() {
  const messages: Captured[] = [];
  return {
    messages,
    ctx: {
      addMessage: (role: string, content: string, options?: { tag?: string }) => {
        messages.push({ role, content, options });
      },
      clearMessages: () => { messages.length = 0; },
      requestRender: () => { /* noop */ },
      tui: undefined,
    },
  };
}

beforeEach(() => {
  resetThemeEngine();
  _resetActiveBlock();
  // Active palette is module-level state; reset it explicitly to
  // pawlwinkle so each test starts from a known baseline (otherwise
  // a prior test that switched to pawlbon leaks into the next one).
  setActivePalette(pawlwinkle);
});

/** A ctx that wires a real InteractiveBlock against a fake deps shim. */
function makeInteractiveCtx() {
  const messages: Captured[] = [];
  let mounted: InteractiveBlock<unknown> | null = null;
  const blockState = {
    tag: "" as string,
    content: "" as string,
    statusHint: "" as string,
    hintCleared: false,
  };
  const deps: InteractiveBlockDeps = {
    pushKeyHandler: () => { /* tracked indirectly */ },
    popKeyHandler: () => { /* tracked indirectly */ },
    requestRender: () => { /* noop */ },
    addMessage: (role, content, options) => {
      messages.push({ role, content, options });
      if (options?.tag) {
        blockState.tag = options.tag;
        blockState.content = content;
      }
    },
    replaceByTag: (tag, content) => {
      blockState.tag = tag;
      blockState.content = content;
      return true;
    },
    removeLastByTag: (tag) => {
      if (blockState.tag === tag) {
        blockState.tag = "";
        blockState.content = "";
        return true;
      }
      return false;
    },
    setStatusHint: (text) => { blockState.statusHint = text; blockState.hintCleared = false; },
    clearStatusHint: () => { blockState.statusHint = ""; blockState.hintCleared = true; },
  };
  const ctx = {
    addMessage: (role: string, content: string, options?: { tag?: string }) => {
      messages.push({ role, content, options });
    },
    clearMessages: () => { messages.length = 0; },
    requestRender: () => { /* noop */ },
    tui: undefined,
    mountInteractiveBlock: <T>(spec: InteractiveBlockSpec<T>) => {
      const block = new InteractiveBlock(spec, deps);
      block.mount();
      mounted = block as unknown as InteractiveBlock<unknown>;
      return block;
    },
  };
  return {
    messages,
    blockState,
    ctx,
    /** The most recently mounted block (typed loose for test convenience). */
    get block(): InteractiveBlock<unknown> | null { return mounted; },
  };
}

describe("/theme command", () => {
  it("with no args, emits the op:themes preview block", async () => {
    const cmd = createThemeCommand();
    const h = makeCtx();
    await cmd.execute("", h.ctx);
    expect(h.messages).toHaveLength(1);
    expect(h.messages[0]!.options?.tag).toBe(THEMES_MESSAGE_TAG);
    expect(h.messages[0]!.content).toContain("pawlwinkle");
    expect(h.messages[0]!.content).toContain("pawlbon");
    expect(h.messages[0]!.content).toContain("catppuccin-mocha");
  });

  it("with a valid name, switches active palette and emits success message", async () => {
    const cmd = createThemeCommand();
    const h = makeCtx();
    getThemeEngine();
    await cmd.execute("pawlbon", h.ctx);
    expect(activePalette().id).toBe("pawlbon");
    expect(h.messages.some((m) => m.content.includes("Switched to pawlbon"))).toBe(true);
  });

  it("with an unknown name, surfaces an error and leaves active palette unchanged", async () => {
    const cmd = createThemeCommand();
    const h = makeCtx();
    getThemeEngine();
    const before = activePalette().id;
    await cmd.execute("definitely-not-a-theme", h.ctx);
    expect(activePalette().id).toBe(before);
    const errors = h.messages.filter((m) => m.role === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.content).toContain("Unknown theme");
    expect(errors[0]!.content).toContain("pawlwinkle");
    expect(errors[0]!.content).toContain("pawlbon");
    expect(errors[0]!.content).toContain("catppuccin-mocha");
  });
});

describe("/themes command", () => {
  it("emits the op:themes preview block", async () => {
    const cmd = createThemesCommand();
    const h = makeCtx();
    await cmd.execute("", h.ctx);
    expect(h.messages).toHaveLength(1);
    expect(h.messages[0]!.options?.tag).toBe(THEMES_MESSAGE_TAG);
  });

  it("output marks the current palette", async () => {
    getThemeEngine().switchTheme("pawlbon");
    const cmd = createThemesCommand();
    const h = makeCtx();
    await cmd.execute("", h.ctx);
    // The marker text is colored, but the substring should still appear.
    expect(h.messages[0]!.content).toContain("(current)");
    // Marker is on the pawlbon row — check pawlbon is present near "current".
    const content = h.messages[0]!.content;
    const currentIdx = content.indexOf("(current)");
    const pawlbonIdx = content.indexOf("pawlbon");
    expect(pawlbonIdx).toBeGreaterThan(-1);
    expect(currentIdx).toBeGreaterThan(pawlbonIdx);
  });
});

describe("/themes interactive picker", () => {
  it("opens the picker via mountInteractiveBlock with initialIndex on current theme", async () => {
    // Pawlwinkle is the default active palette → index 0 in listPalettes order.
    const cmd = createThemesCommand();
    const h = makeInteractiveCtx();
    await cmd.execute("", h.ctx);
    expect(h.block).not.toBeNull();
    expect(h.blockState.tag).toBe(THEMES_MESSAGE_TAG);
    // Initial render has the picker highlight marker on pawlwinkle.
    const winkleIdx = h.blockState.content.indexOf("pawlwinkle");
    const markerIdx = h.blockState.content.indexOf("▸");
    expect(markerIdx).toBeGreaterThan(-1);
    expect(markerIdx).toBeLessThan(winkleIdx);
    // Status hint set while mounted.
    expect(h.blockState.statusHint).toContain("themes picker");
  });

  it("arrow down moves the highlight to the next palette and re-renders the block", async () => {
    const cmd = createThemesCommand();
    const h = makeInteractiveCtx();
    await cmd.execute("", h.ctx);
    h.block!.handleKey({ type: "arrow", direction: "down", ctrl: false, alt: false });
    // The marker (▸) appears exactly once, sits just before pawlbon
    // (the new highlight), and pawlwinkle (now unhighlighted) appears
    // earlier in the rendered block than the marker does.
    const content = h.blockState.content;
    const markers = [...content.matchAll(/▸/g)];
    expect(markers).toHaveLength(1);
    const markerIdx = markers[0]!.index!;
    const winkleIdx = content.indexOf("pawlwinkle");
    const bonIdx = content.indexOf("pawlbon");
    expect(winkleIdx).toBeLessThan(markerIdx);     // pawlwinkle row is above the marker
    expect(markerIdx).toBeLessThan(bonIdx);        // marker sits just before pawlbon's label
  });

  it("Enter switches the palette, replaces block with summary, clears hint", async () => {
    const cmd = createThemesCommand();
    const h = makeInteractiveCtx();
    await cmd.execute("", h.ctx);

    // Navigate to pawlbon and press Enter.
    h.block!.handleKey({ type: "arrow", direction: "down", ctrl: false, alt: false });
    h.block!.handleKey({ type: "enter", shift: false });
    // onSelect is fire-and-forget from handleKey; poll until the
    // summary replaceByTag has run.
    for (let i = 0; i < 50 && !h.blockState.content.includes("switched to"); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }

    expect(activePalette().id).toBe("pawlbon");
    // Block was replaced with the one-line summary, still tagged.
    expect(h.blockState.tag).toBe(THEMES_MESSAGE_TAG);
    expect(h.blockState.content).toContain("switched to");
    expect(h.blockState.content).toContain("pawlbon");
    expect(h.blockState.hintCleared).toBe(true);
  });

  it("Esc removes the block entirely and leaves the active palette unchanged", async () => {
    const before = activePalette().id;
    const cmd = createThemesCommand();
    const h = makeInteractiveCtx();
    await cmd.execute("", h.ctx);

    // Move highlight but cancel before selecting.
    h.block!.handleKey({ type: "arrow", direction: "down", ctrl: false, alt: false });
    h.block!.handleKey({ type: "escape" });

    expect(activePalette().id).toBe(before);
    // Block removed: no content remains under the tag.
    expect(h.blockState.tag).toBe("");
    expect(h.blockState.content).toBe("");
    expect(h.blockState.hintCleared).toBe(true);
  });

  it("PageDown is a no-op with only 3 themes (consumed but no advance)", async () => {
    const cmd = createThemesCommand();
    const h = makeInteractiveCtx();
    await cmd.execute("", h.ctx);
    const before = h.blockState.content;
    h.block!.handleKey({ type: "pagedown" });
    // Block content unchanged since 3 < 5 (no replaceByTag fires).
    expect(h.blockState.content).toBe(before);
  });

  it("`/theme` no-args opens the same picker as /themes", async () => {
    const cmd = createThemeCommand();
    const h = makeInteractiveCtx();
    await cmd.execute("", h.ctx);
    expect(h.block).not.toBeNull();
    expect(h.blockState.tag).toBe(THEMES_MESSAGE_TAG);
  });
});
