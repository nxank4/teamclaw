import { describe, expect, it, beforeEach, afterAll, beforeAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createThemeCommand, createThemesCommand } from "../../../src/app/commands/theme.js";
import { resetThemeEngine, getThemeEngine } from "../../../src/tui/themes/theme-engine.js";
import { activePalette } from "../../../src/tui/themes/active.js";
import { THEMES_MESSAGE_TAG } from "../../../src/tui/components/themes-preview.js";

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
});

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
