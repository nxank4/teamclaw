import { describe, it, expect } from "vitest";
import { parseChord, matchesChord, normalizeBinding, parseAlternatives } from "../../../src/tui/keybindings/chord-parser.js";

describe("ChordParser", () => {
  it("parses 'ctrl+n' correctly", () => {
    const chords = parseChord("ctrl+n");
    expect(chords).toHaveLength(1);
    expect(chords[0]).toEqual({ key: "n", ctrl: true, shift: false, alt: false, meta: false });
  });

  it("parses 'shift+tab' correctly", () => {
    const chords = parseChord("shift+tab");
    expect(chords).toHaveLength(1);
    expect(chords[0]).toEqual({ key: "tab", ctrl: false, shift: true, alt: false, meta: false });
  });

  it("parses 'ctrl+shift+p' with multiple modifiers", () => {
    const chords = parseChord("ctrl+shift+p");
    expect(chords).toHaveLength(1);
    expect(chords[0]!.ctrl).toBe(true);
    expect(chords[0]!.shift).toBe(true);
    expect(chords[0]!.key).toBe("p");
  });

  it("parses '<leader>n' as leader reference", () => {
    const chords = parseChord("<leader>n");
    expect(chords).toHaveLength(1);
    expect(chords[0]!.key).toBe("<leader>n");
  });

  it("normalizes 'CTRL+N' to 'ctrl+n'", () => {
    expect(normalizeBinding("CTRL+N")).toBe("ctrl+n");
  });

  it("parses chord 'ctrl+k ctrl+s' as two-step", () => {
    const chords = parseChord("ctrl+k ctrl+s");
    expect(chords).toHaveLength(2);
    expect(chords[0]!.key).toBe("k");
    expect(chords[0]!.ctrl).toBe(true);
    expect(chords[1]!.key).toBe("s");
    expect(chords[1]!.ctrl).toBe(true);
  });

  it("'ctrl+c,ctrl+d' parses as two alternatives", () => {
    const alts = parseAlternatives("ctrl+c,ctrl+d");
    expect(alts).toEqual(["ctrl+c", "ctrl+d"]);
  });

  it("matchesChord checks modifiers correctly", () => {
    const chord = parseChord("ctrl+n")[0]!;
    expect(matchesChord(chord, "n", { ctrl: true })).toBe(true);
    expect(matchesChord(chord, "n", { ctrl: false })).toBe(false);
    expect(matchesChord(chord, "n", { ctrl: true, shift: true })).toBe(false);
  });

  it("normalizes modifier order", () => {
    expect(normalizeBinding("shift+ctrl+a")).toBe("ctrl+shift+a");
  });

  it("handles option as alt", () => {
    const chords = parseChord("option+p");
    expect(chords[0]!.alt).toBe(true);
    expect(chords[0]!.key).toBe("p");
  });
});
