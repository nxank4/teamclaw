import { describe, it, expect, beforeEach } from "vitest";
import { DiffRenderer } from "../../../src/tui/core/renderer.js";
import { VirtualTerminal } from "../../../src/tui/core/terminal.js";
import { syncStart, syncEnd, clearLine, cursorUp } from "../../../src/tui/core/ansi.js";

describe("DiffRenderer", () => {
  let renderer: DiffRenderer;
  let term: VirtualTerminal;

  beforeEach(() => {
    renderer = new DiffRenderer();
    term = new VirtualTerminal(80, 24);
  });

  it("renders all lines on first call", () => {
    renderer.render(term, ["Line 1", "Line 2", "Line 3"]);

    const output = term.getRawOutput();
    expect(output).toContain("Line 1");
    expect(output).toContain("Line 2");
    expect(output).toContain("Line 3");
    // Should be wrapped in sync
    expect(output).toContain(syncStart);
    expect(output).toContain(syncEnd);
  });

  it("skips render when nothing changed", () => {
    renderer.render(term, ["Line 1", "Line 2"]);
    term.clearOutput();

    renderer.render(term, ["Line 1", "Line 2"]);

    // Should not have written anything (no sync markers)
    expect(term.getRawOutput()).toBe("");
  });

  it("only rewrites changed lines", () => {
    renderer.render(term, ["Line 1", "Line 2", "Line 3"]);
    term.clearOutput();

    renderer.render(term, ["Line 1", "CHANGED", "Line 3"]);

    const output = term.getRawOutput();
    expect(output).toContain("CHANGED");
    // Should contain cursor up to move to the changed line
    expect(output).toContain(cursorUp(2)); // move up 2 from end to line 2
  });

  it("handles appending new lines", () => {
    renderer.render(term, ["Line 1"]);
    term.clearOutput();

    renderer.render(term, ["Line 1", "Line 2"]);

    const output = term.getRawOutput();
    expect(output).toContain("Line 2");
    expect(output).toContain(syncStart);
    expect(output).toContain(syncEnd);
  });

  it("clears extra lines when output gets shorter", () => {
    renderer.render(term, ["Line 1", "Line 2", "Line 3"]);
    term.clearOutput();

    renderer.render(term, ["Line 1"]);

    const output = term.getRawOutput();
    // Should clear the old lines 2 and 3
    expect(output).toContain(clearLine);
  });

  it("triggers full re-render on width change", () => {
    renderer.render(term, ["Line 1", "Line 2"]);
    term.clearOutput();

    term.simulateResize(40, 24); // width changed from 80 to 40
    renderer.render(term, ["Line 1", "Line 2"]);

    // Should do a full render even though lines are the same
    const output = term.getRawOutput();
    expect(output).toContain("Line 1");
    expect(output).toContain("Line 2");
  });

  it("handles empty line array", () => {
    renderer.render(term, []);
    const output = term.getRawOutput();
    expect(output).toContain(syncStart);
    expect(output).toContain(syncEnd);
  });

  it("reset() forces full re-render on next call", () => {
    renderer.render(term, ["Line 1"]);
    term.clearOutput();

    renderer.reset();
    renderer.render(term, ["Line 1"]);

    // Should write even though content is the same (prev was cleared)
    const output = term.getRawOutput();
    expect(output).toContain("Line 1");
  });
});
