import { describe, it, expect } from "vitest";
import { displayKey, getPlatformFallbacks, getMultilineKey } from "../../../src/tui/keybindings/platform-detect.js";

describe("platform-detect", () => {
  it("displayKey shows macOS symbols", () => {
    const result = displayKey("ctrl+p", "macos");
    expect(result).toBe("⌃p");
  });

  it("displayKey shows readable names on Linux", () => {
    const result = displayKey("ctrl+p", "linux");
    expect(result).toBe("Ctrl+P");
  });

  it("displayKey shows alt as ⌥ on macOS", () => {
    const result = displayKey("alt+t", "macos");
    expect(result).toBe("⌥t");
  });

  it("displayKey handles shift+tab on macOS", () => {
    const result = displayKey("shift+tab", "macos");
    expect(result).toBe("⇧⇥");
  });

  it("getPlatformFallbacks includes alt+m on Windows", () => {
    const fallbacks = getPlatformFallbacks("windows");
    expect(fallbacks["alt+m"]).toBe("mode:cycle");
  });

  it("getPlatformFallbacks is empty on macOS", () => {
    const fallbacks = getPlatformFallbacks("macos");
    expect(Object.keys(fallbacks)).toHaveLength(0);
  });

  it("getMultilineKey returns alt+enter on macOS", () => {
    expect(getMultilineKey("macos")).toBe("alt+enter");
  });

  it("getMultilineKey returns shift+enter on Linux", () => {
    expect(getMultilineKey("linux")).toBe("shift+enter");
  });
});
