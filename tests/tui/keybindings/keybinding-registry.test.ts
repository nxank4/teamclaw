import { describe, it, expect, vi } from "vitest";
import { KeybindingRegistry } from "../../../src/tui/keybindings/keybinding-registry.js";

describe("KeybindingRegistry", () => {
  it("register adds binding", () => {
    const reg = new KeybindingRegistry();
    reg.register({ key: "ctrl+n", action: "new", handler: vi.fn(), description: "New", category: "session", modes: ["normal"], configurable: true });
    expect(reg.getAll()).toHaveLength(1);
  });

  it("handleKey returns true for registered key in correct mode", () => {
    const reg = new KeybindingRegistry();
    const fn = vi.fn();
    reg.register({ key: "ctrl+n", action: "new", handler: fn, description: "New", category: "session", modes: ["normal"], configurable: true });
    expect(reg.handleKey("ctrl+n")).toBe(true);
    expect(fn).toHaveBeenCalled();
  });

  it("handleKey returns false for unregistered key", () => {
    const reg = new KeybindingRegistry();
    expect(reg.handleKey("ctrl+x")).toBe(false);
  });

  it("mode stack: permission mode blocks normal bindings", () => {
    const reg = new KeybindingRegistry();
    const fn = vi.fn();
    reg.register({ key: "ctrl+n", action: "new", handler: fn, description: "New", category: "session", modes: ["normal"], configurable: true });
    reg.pushMode("permission");
    expect(reg.handleKey("ctrl+n")).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it("pushMode/popMode works correctly", () => {
    const reg = new KeybindingRegistry();
    expect(reg.getCurrentMode()).toBe("normal");
    reg.pushMode("permission");
    expect(reg.getCurrentMode()).toBe("permission");
    reg.popMode();
    expect(reg.getCurrentMode()).toBe("normal");
  });

  it("getActiveBindings filters by current mode", () => {
    const reg = new KeybindingRegistry();
    reg.register({ key: "y", action: "approve", handler: vi.fn(), description: "Approve", category: "tools", modes: ["permission"], configurable: false });
    reg.register({ key: "ctrl+n", action: "new", handler: vi.fn(), description: "New", category: "session", modes: ["normal"], configurable: true });

    expect(reg.getActiveBindings()).toHaveLength(1); // only normal bindings
    reg.pushMode("permission");
    expect(reg.getActiveBindings()).toHaveLength(1); // only permission bindings
  });
});
