import { describe, it, expect } from "vitest";
import { isValidHex, contrastRatio, meetsWCAGAA, isColorSupported } from "../../../src/tui/themes/color-utils.js";

describe("color-utils", () => {
  it("isValidHex accepts #RRGGBB", () => {
    expect(isValidHex("#FF5555")).toBe(true);
    expect(isValidHex("#ff5555")).toBe(true);
  });

  it("isValidHex accepts #RGB", () => {
    expect(isValidHex("#F55")).toBe(true);
  });

  it("isValidHex rejects invalid strings", () => {
    expect(isValidHex("not-a-color")).toBe(false);
    expect(isValidHex("#GGGGGG")).toBe(false);
    expect(isValidHex("FF5555")).toBe(false);
  });

  it("contrastRatio calculates correctly", () => {
    const ratio = contrastRatio("#FFFFFF", "#000000");
    expect(ratio).toBeCloseTo(21, 0); // Black on white = 21:1
  });

  it("meetsWCAGAA returns true for black-on-white", () => {
    expect(meetsWCAGAA("#000000", "#FFFFFF")).toBe(true);
  });

  it("meetsWCAGAA returns false for low contrast", () => {
    expect(meetsWCAGAA("#777777", "#888888")).toBe(false);
  });

  it("isColorSupported returns boolean", () => {
    expect(typeof isColorSupported()).toBe("boolean");
  });
});
