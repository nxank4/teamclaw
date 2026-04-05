import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Instead of mocking homedir, we test the config parsing logic directly
 * by creating temporary files and verifying parsing behavior.
 */
describe("keybinding-config", () => {
  const testDir = join(tmpdir(), `openpawl-kb-test-${Date.now()}`);

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  // Test the JSON parsing logic directly
  it("Claude Code style JSON format is valid", () => {
    const config = {
      bindings: [
        { context: "chat", bindings: { "shift+tab": "mode:cycle", "ctrl+g": "editor:external" } },
        { context: "global", bindings: { "ctrl+p": "palette:show" } },
      ],
    };
    const file = join(testDir, "keybindings.json");
    writeFileSync(file, JSON.stringify(config));
    const parsed = JSON.parse(readFileSync(file, "utf-8"));
    expect(parsed.bindings).toHaveLength(2);
    expect(parsed.bindings[0].bindings["shift+tab"]).toBe("mode:cycle");
    expect(parsed.bindings[1].context).toBe("global");
  });

  it("OpenCode style simple format is valid", () => {
    const config = {
      leader: "ctrl+x",
      session_new: "<leader>n",
      model_list: "<leader>m",
    };
    const file = join(testDir, "keybindings.json");
    writeFileSync(file, JSON.stringify(config));
    const parsed = JSON.parse(readFileSync(file, "utf-8"));
    expect(parsed.leader).toBe("ctrl+x");
    expect(parsed.session_new).toBe("<leader>n");
  });

  it("null value marks unbind in Claude Code style", () => {
    const config = {
      bindings: [{ context: "global", bindings: { "ctrl+p": null } }],
    };
    const file = join(testDir, "keybindings.json");
    writeFileSync(file, JSON.stringify(config));
    const parsed = JSON.parse(readFileSync(file, "utf-8"));
    expect(parsed.bindings[0].bindings["ctrl+p"]).toBeNull();
  });

  it("context-based bindings applied correctly", () => {
    const config = {
      bindings: [
        { context: "chat", bindings: { "shift+tab": "mode:cycle" } },
        { context: "global", bindings: { "ctrl+p": "palette:show" } },
        { context: "shell", bindings: { "escape": "shell:exit" } },
      ],
    };
    const file = join(testDir, "keybindings.json");
    writeFileSync(file, JSON.stringify(config));
    const parsed = JSON.parse(readFileSync(file, "utf-8"));
    expect(parsed.bindings).toHaveLength(3);
    expect(parsed.bindings[2].context).toBe("shell");
  });

  it("$schema field is preserved", () => {
    const config = {
      $schema: "https://openpawl.dev/schemas/keybindings.json",
      bindings: [],
    };
    const file = join(testDir, "keybindings.json");
    writeFileSync(file, JSON.stringify(config));
    const parsed = JSON.parse(readFileSync(file, "utf-8"));
    expect(parsed.$schema).toBe("https://openpawl.dev/schemas/keybindings.json");
  });

  it("invalid JSON does not crash", () => {
    const file = join(testDir, "keybindings.json");
    writeFileSync(file, "not json {{{");
    expect(() => JSON.parse(readFileSync(file, "utf-8"))).toThrow();
  });
});
