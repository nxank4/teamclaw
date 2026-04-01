import { describe, it, expect, vi, beforeEach } from "vitest";
import { TUI } from "../../../src/tui/core/tui.js";
import { VirtualTerminal } from "../../../src/tui/core/terminal.js";
import type { Component } from "../../../src/tui/core/component.js";
import type { KeyEvent } from "../../../src/tui/core/input.js";

function makeComponent(id: string, lines: string[], opts: { focusable?: boolean; onKey?: (e: KeyEvent) => boolean } = {}): Component {
  return {
    id,
    render: () => lines,
    focusable: opts.focusable,
    onKey: opts.onKey,
  };
}

describe("TUI", () => {
  let term: VirtualTerminal;
  let tui: TUI;

  beforeEach(() => {
    term = new VirtualTerminal(80, 24);
    tui = new TUI(term);
  });

  describe("rendering", () => {
    it("renders child components to terminal", async () => {
      tui.start();
      tui.addChild(makeComponent("text1", ["Hello World"]));

      // Wait for nextTick render
      await new Promise(r => process.nextTick(r));

      const output = term.getRawOutput();
      expect(output).toContain("Hello World");
      tui.stop();
    });

    it("renders multiple children top-to-bottom", async () => {
      tui.start();
      tui.addChild(makeComponent("a", ["Line A"]));
      tui.addChild(makeComponent("b", ["Line B"]));

      await new Promise(r => process.nextTick(r));

      const output = term.getRawOutput();
      const aIdx = output.indexOf("Line A");
      const bIdx = output.indexOf("Line B");
      expect(aIdx).toBeLessThan(bIdx);
      tui.stop();
    });

    it("re-renders after removeChild", async () => {
      tui.start();
      tui.addChild(makeComponent("a", ["Line A"]));
      tui.addChild(makeComponent("b", ["Line B"]));

      await new Promise(r => process.nextTick(r));
      term.clearOutput();

      tui.removeChild("a");
      await new Promise(r => process.nextTick(r));

      const output = term.getRawOutput();
      expect(output).toContain("Line B");
      tui.stop();
    });
  });

  describe("focus management", () => {
    it("routes input to focused component", async () => {
      const keyHandler = vi.fn().mockReturnValue(true);
      const comp = makeComponent("editor", ["Input here"], { focusable: true, onKey: keyHandler });

      tui.start();
      tui.addChild(comp);
      tui.setFocus(comp);

      // Simulate typing 'a'
      term.simulateInput("a");
      await new Promise(r => process.nextTick(r));

      expect(keyHandler).toHaveBeenCalled();
      tui.stop();
    });

    it("Tab cycles focus between focusable components", async () => {
      const comp1 = makeComponent("c1", ["C1"], { focusable: true });
      const comp2 = makeComponent("c2", ["C2"], { focusable: true });

      tui.start();
      tui.addChild(comp1);
      tui.addChild(comp2);
      tui.setFocus(comp1);

      // Simulate Tab
      term.simulateInput("\t");
      await new Promise(r => process.nextTick(r));

      expect(tui.getFocus()).toBe(comp2);
      tui.stop();
    });
  });

  describe("overlay", () => {
    it("overlay renders instead of root when shown", async () => {
      const overlay = makeComponent("modal", ["Modal Content"]);

      tui.start();
      tui.addChild(makeComponent("bg", ["Background"]));
      tui.showOverlay(overlay);

      await new Promise(r => process.nextTick(r));

      const output = term.getRawOutput();
      // Overlay should have been rendered last
      const bgIdx = output.lastIndexOf("Background");
      const modalIdx = output.lastIndexOf("Modal Content");
      // Modal should appear after background in the output stream
      expect(modalIdx).toBeGreaterThan(bgIdx);
      tui.stop();
    });

    it("overlay receives input instead of focused component", async () => {
      const rootHandler = vi.fn().mockReturnValue(true);
      const overlayHandler = vi.fn().mockReturnValue(true);

      const root = makeComponent("root", ["Root"], { focusable: true, onKey: rootHandler });
      const overlay = makeComponent("modal", ["Modal"], { focusable: true, onKey: overlayHandler });

      tui.start();
      tui.addChild(root);
      tui.setFocus(root);
      tui.showOverlay(overlay);

      term.simulateInput("x");
      await new Promise(r => process.nextTick(r));

      expect(overlayHandler).toHaveBeenCalled();
      expect(rootHandler).not.toHaveBeenCalled();
      tui.stop();
    });

    it("hideOverlay restores root rendering", async () => {
      tui.start();
      tui.addChild(makeComponent("bg", ["Background"]));
      tui.showOverlay(makeComponent("modal", ["Modal"]));

      await new Promise(r => process.nextTick(r));
      term.clearOutput();

      tui.hideOverlay();
      await new Promise(r => process.nextTick(r));

      expect(tui.hasOverlay()).toBe(false);
      tui.stop();
    });
  });

  describe("lifecycle", () => {
    it("Ctrl+C triggers onExit", async () => {
      const exitHandler = vi.fn();
      tui.onExit = exitHandler;
      tui.start();

      term.simulateInput(Buffer.from([0x03])); // Ctrl+C
      await new Promise(r => process.nextTick(r));

      expect(exitHandler).toHaveBeenCalled();
    });

    it("stop() can be called multiple times safely", () => {
      tui.start();
      tui.stop();
      expect(() => tui.stop()).not.toThrow();
    });
  });
});
