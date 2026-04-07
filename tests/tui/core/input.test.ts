import { describe, it, expect, vi, beforeEach } from "vitest";
import { InputParser, type KeyEvent } from "../../../src/tui/core/input.js";

describe("InputParser", () => {
  let parser: InputParser;
  let events: KeyEvent[];

  beforeEach(() => {
    parser = new InputParser();
    events = [];
    parser.onEvent = (e) => events.push(e);
  });

  describe("regular characters", () => {
    it("parses ASCII letters", () => {
      parser.feed(Buffer.from("a"));
      expect(events).toEqual([{ type: "char", char: "a", ctrl: false, alt: false, shift: false }]);
    });

    it("detects uppercase as shift", () => {
      parser.feed(Buffer.from("A"));
      expect(events[0]).toMatchObject({ type: "char", char: "A", shift: true });
    });

    it("parses digits", () => {
      parser.feed(Buffer.from("5"));
      expect(events[0]).toMatchObject({ type: "char", char: "5" });
    });

    it("parses space", () => {
      parser.feed(Buffer.from(" "));
      expect(events[0]).toMatchObject({ type: "char", char: " " });
    });

    it("parses multiple characters in one buffer", () => {
      parser.feed(Buffer.from("abc"));
      expect(events).toHaveLength(3);
      expect(events.map(e => (e as any).char)).toEqual(["a", "b", "c"]);
    });
  });

  describe("special keys", () => {
    it("parses Enter (CR)", () => {
      parser.feed(Buffer.from("\r"));
      expect(events).toEqual([{ type: "enter", shift: false }]);
    });

    it("parses Backspace (DEL)", () => {
      parser.feed(Buffer.from("\x7f"));
      expect(events).toEqual([{ type: "backspace" }]);
    });

    it("parses Tab", () => {
      parser.feed(Buffer.from("\t"));
      expect(events).toEqual([{ type: "tab", shift: false }]);
    });
  });

  describe("Ctrl+key combinations", () => {
    it("parses Ctrl+C (0x03)", () => {
      parser.feed(Buffer.from([0x03]));
      expect(events).toEqual([{ type: "char", char: "c", ctrl: true, alt: false, shift: false }]);
    });

    it("parses Ctrl+A (0x01)", () => {
      parser.feed(Buffer.from([0x01]));
      expect(events[0]).toMatchObject({ type: "char", char: "a", ctrl: true });
    });

    it("parses Ctrl+Z (0x1a)", () => {
      parser.feed(Buffer.from([0x1a]));
      expect(events[0]).toMatchObject({ type: "char", char: "z", ctrl: true });
    });
  });

  describe("arrow keys", () => {
    it("parses arrow up (ESC[A)", () => {
      parser.feed(Buffer.from("\x1b[A"));
      expect(events).toEqual([{ type: "arrow", direction: "up", ctrl: false, alt: false }]);
    });

    it("parses arrow down (ESC[B)", () => {
      parser.feed(Buffer.from("\x1b[B"));
      expect(events[0]).toMatchObject({ type: "arrow", direction: "down" });
    });

    it("parses arrow right (ESC[C)", () => {
      parser.feed(Buffer.from("\x1b[C"));
      expect(events[0]).toMatchObject({ type: "arrow", direction: "right" });
    });

    it("parses arrow left (ESC[D)", () => {
      parser.feed(Buffer.from("\x1b[D"));
      expect(events[0]).toMatchObject({ type: "arrow", direction: "left" });
    });

    it("parses Ctrl+Right (ESC[1;5C)", () => {
      parser.feed(Buffer.from("\x1b[1;5C"));
      expect(events[0]).toMatchObject({ type: "arrow", direction: "right", ctrl: true, alt: false });
    });

    it("parses Alt+Left (ESC[1;3D)", () => {
      parser.feed(Buffer.from("\x1b[1;3D"));
      expect(events[0]).toMatchObject({ type: "arrow", direction: "left", ctrl: false, alt: true });
    });
  });

  describe("navigation keys", () => {
    it("parses Home (ESC[H)", () => {
      parser.feed(Buffer.from("\x1b[H"));
      expect(events).toEqual([{ type: "home" }]);
    });

    it("parses End (ESC[F)", () => {
      parser.feed(Buffer.from("\x1b[F"));
      expect(events).toEqual([{ type: "end" }]);
    });

    it("parses Delete (ESC[3~)", () => {
      parser.feed(Buffer.from("\x1b[3~"));
      expect(events).toEqual([{ type: "delete" }]);
    });

    it("parses Page Up (ESC[5~)", () => {
      parser.feed(Buffer.from("\x1b[5~"));
      expect(events).toEqual([{ type: "pageup" }]);
    });

    it("parses Page Down (ESC[6~)", () => {
      parser.feed(Buffer.from("\x1b[6~"));
      expect(events).toEqual([{ type: "pagedown" }]);
    });

    it("parses Shift+Tab (ESC[Z)", () => {
      parser.feed(Buffer.from("\x1b[Z"));
      expect(events).toEqual([{ type: "tab", shift: true }]);
    });
  });

  describe("Escape key", () => {
    it("emits escape after 10ms timeout when ESC is alone", async () => {
      parser.feed(Buffer.from("\x1b"));
      expect(events).toHaveLength(0); // not emitted yet

      await new Promise(r => setTimeout(r, 20));
      expect(events).toEqual([{ type: "escape" }]);
    });

    it("does not emit escape when ESC is part of a sequence", () => {
      parser.feed(Buffer.from("\x1b[A")); // arrow up
      expect(events[0]?.type).toBe("arrow");
      expect(events).not.toContainEqual({ type: "escape" });
    });
  });

  describe("Alt+key", () => {
    it("parses Alt+f (ESC f)", () => {
      parser.feed(Buffer.from("\x1bf"));
      expect(events[0]).toMatchObject({ type: "char", char: "f", alt: true });
    });

    it("parses Alt+b (ESC b)", () => {
      parser.feed(Buffer.from("\x1bb"));
      expect(events[0]).toMatchObject({ type: "char", char: "b", alt: true });
    });
  });

  describe("bracketed paste", () => {
    it("detects paste start and end markers", () => {
      parser.feed(Buffer.from("\x1b[200~Hello World\x1b[201~"));
      expect(events).toEqual([{ type: "paste", text: "Hello World" }]);
    });

    it("handles multi-line paste", () => {
      parser.feed(Buffer.from("\x1b[200~Line 1\nLine 2\nLine 3\x1b[201~"));
      expect(events).toHaveLength(1);
      expect((events[0] as any).text).toBe("Line 1\nLine 2\nLine 3");
    });

    it("handles paste arriving in chunks", () => {
      parser.feed(Buffer.from("\x1b[200~Hello"));
      expect(events).toHaveLength(0); // waiting for end marker
      parser.feed(Buffer.from(" World\x1b[201~"));
      expect(events).toEqual([{ type: "paste", text: "Hello World" }]);
    });
  });

  describe("multi-byte UTF-8", () => {
    it("parses 2-byte UTF-8 (é)", () => {
      parser.feed(Buffer.from("é"));
      expect(events[0]).toMatchObject({ type: "char", char: "é" });
    });

    it("parses 3-byte UTF-8 (你)", () => {
      parser.feed(Buffer.from("你"));
      expect(events[0]).toMatchObject({ type: "char", char: "你" });
    });

    it("parses 4-byte UTF-8 (emoji 😀)", () => {
      parser.feed(Buffer.from("😀"));
      expect(events[0]).toMatchObject({ type: "char", char: "😀" });
    });
  });
});
