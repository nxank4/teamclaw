import { describe, it, expect, vi } from "vitest";
import { ShellMode } from "../../../src/tui/keybindings/shell-mode.js";

describe("ShellMode", () => {
  it("'!' at start of empty prompt activates shell mode", () => {
    const sm = new ShellMode();
    expect(sm.shouldActivate("!", 1)).toBe(true);
  });

  it("'!' in middle of text does NOT activate", () => {
    const sm = new ShellMode();
    expect(sm.shouldActivate("hello!", 6)).toBe(false);
  });

  it("multi-char input does not activate", () => {
    const sm = new ShellMode();
    expect(sm.shouldActivate("!npm", 4)).toBe(false);
  });

  it("extractCommand strips '!' prefix", () => {
    const sm = new ShellMode();
    expect(sm.extractCommand("!npm test")).toBe("npm test");
    expect(sm.extractCommand("! ls -la src/")).toBe("ls -la src/");
    expect(sm.extractCommand("!  git status")).toBe("git status");
  });

  it("execute runs command and deactivates", async () => {
    const sm = new ShellMode();
    sm.activate();
    expect(sm.isActive()).toBe(true);

    const executor = vi.fn().mockResolvedValue({
      stdout: "PASS", stderr: "", exitCode: 0, duration: 100,
    });

    const result = await sm.execute("npm test", executor);
    expect(result.command).toBe("npm test");
    expect(result.stdout).toBe("PASS");
    expect(result.exitCode).toBe(0);
    expect(result.addedToContext).toBe(true);
    expect(sm.isActive()).toBe(false);
  });

  it("deactivate clears active state", () => {
    const sm = new ShellMode();
    sm.activate();
    sm.deactivate();
    expect(sm.isActive()).toBe(false);
  });
});
