import { describe, it, expect, vi } from "vitest";
import { CommandPalette, type PaletteSource } from "../../../src/tui/keybindings/command-palette.js";

function makeSource(name: string, items: { id: string; label: string; desc?: string; cat?: string }[]): PaletteSource {
  return {
    name,
    icon: ">",
    getItems: () => items.map((i) => ({
      id: i.id,
      label: i.label,
      description: i.desc ?? "",
      category: i.cat ?? name,
      icon: ">",
      action: vi.fn(),
      score: 0,
    })),
  };
}

describe("CommandPalette", () => {
  it("show() makes palette visible", () => {
    const cp = new CommandPalette();
    cp.show();
    expect(cp.isVisible()).toBe(true);
  });

  it("hide() makes palette invisible", () => {
    const cp = new CommandPalette();
    cp.show();
    cp.hide();
    expect(cp.isVisible()).toBe(false);
  });

  it("filter: 'mod' matches /model and /mode", () => {
    const cp = new CommandPalette();
    cp.addSource(makeSource("Commands", [
      { id: "model", label: "/model", desc: "Switch model" },
      { id: "mode", label: "/mode", desc: "Change mode" },
      { id: "help", label: "/help", desc: "Show help" },
    ]));
    cp.show("mod");
    const items = cp.getFilteredItems();
    expect(items.length).toBe(2);
    expect(items.map((i) => i.label)).toContain("/model");
    expect(items.map((i) => i.label)).toContain("/mode");
  });

  it("fuzzy match: 'ss' matches 'session'", () => {
    const cp = new CommandPalette();
    cp.addSource(makeSource("Commands", [
      { id: "session", label: "/session", desc: "Session info" },
      { id: "help", label: "/help", desc: "Show help" },
    ]));
    cp.show("ss");
    const items = cp.getFilteredItems();
    expect(items.some((i) => i.label === "/session")).toBe(true);
  });

  it("items sorted by score (frecency)", async () => {
    const cp = new CommandPalette();
    cp.addSource(makeSource("Commands", [
      { id: "model", label: "/model" },
      { id: "mode", label: "/mode" },
    ]));

    // Execute /mode to boost its frecency
    cp.show("mod");
    cp.handleKey({ type: "arrow", direction: "down", ctrl: false, alt: false });
    await cp.executeSelected();

    // Now /mode should rank higher
    cp.show("mod");
    const items = cp.getFilteredItems();
    expect(items[0]!.id).toBe("mode");
  });

  it("↑/↓ navigates items", () => {
    const cp = new CommandPalette();
    cp.addSource(makeSource("Commands", [
      { id: "a", label: "/a" },
      { id: "b", label: "/b" },
    ]));
    cp.show();
    expect(cp.getSelectedIndex()).toBe(0);
    cp.handleKey({ type: "arrow", direction: "down", ctrl: false, alt: false });
    expect(cp.getSelectedIndex()).toBe(1);
    cp.handleKey({ type: "arrow", direction: "up", ctrl: false, alt: false });
    expect(cp.getSelectedIndex()).toBe(0);
  });

  it("Enter executes selected", async () => {
    const action = vi.fn();
    const cp = new CommandPalette();
    cp.addSource({
      name: "test",
      icon: ">",
      getItems: () => [{
        id: "t", label: "/test", description: "", category: "test",
        icon: ">", action, score: 0,
      }],
    });
    cp.show();
    cp.handleKey({ type: "enter" });
    // Wait for async
    await new Promise((r) => setTimeout(r, 0));
    expect(action).toHaveBeenCalledOnce();
    expect(cp.isVisible()).toBe(false);
  });

  it("Escape hides palette", () => {
    const cp = new CommandPalette();
    cp.show();
    cp.handleKey({ type: "escape" });
    expect(cp.isVisible()).toBe(false);
  });

  it("render produces box drawing output", () => {
    const cp = new CommandPalette();
    cp.addSource(makeSource("Commands", [{ id: "a", label: "/help" }]));
    cp.show();
    const lines = cp.render(80);
    expect(lines.length).toBeGreaterThan(3);
    const text = lines.join("\n");
    expect(text).toContain("Command Palette");
    expect(text).toContain("/help");
  });
});
