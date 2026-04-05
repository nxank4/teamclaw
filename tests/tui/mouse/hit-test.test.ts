import { describe, it, expect, vi } from "vitest";
import { HitTester } from "../../../src/tui/mouse/hit-test.js";

describe("HitTester", () => {
  it("register adds element", () => {
    const ht = new HitTester();
    ht.register({ id: "a", region: { x1: 1, y1: 1, x2: 10, y2: 1 }, hoverStyle: "underline", onClick: vi.fn() });
    expect(ht.count).toBe(1);
  });

  it("hitTest finds element at correct position", () => {
    const ht = new HitTester();
    ht.register({ id: "btn", region: { x1: 5, y1: 3, x2: 10, y2: 3 }, hoverStyle: "underline", onClick: vi.fn() });
    expect(ht.hitTest(7, 3)?.id).toBe("btn");
  });

  it("hitTest returns null for empty space", () => {
    const ht = new HitTester();
    ht.register({ id: "btn", region: { x1: 5, y1: 3, x2: 10, y2: 3 }, hoverStyle: "underline", onClick: vi.fn() });
    expect(ht.hitTest(1, 1)).toBeNull();
    expect(ht.hitTest(11, 3)).toBeNull();
  });

  it("hitTest handles overlapping regions (last registered wins)", () => {
    const ht = new HitTester();
    ht.register({ id: "a", region: { x1: 1, y1: 1, x2: 20, y2: 1 }, hoverStyle: "underline", onClick: vi.fn() });
    ht.register({ id: "b", region: { x1: 5, y1: 1, x2: 10, y2: 1 }, hoverStyle: "underline", onClick: vi.fn() });
    expect(ht.hitTest(7, 1)?.id).toBe("b");
  });

  it("clear removes all elements", () => {
    const ht = new HitTester();
    ht.register({ id: "a", region: { x1: 1, y1: 1, x2: 10, y2: 1 }, hoverStyle: "underline", onClick: vi.fn() });
    ht.clear();
    expect(ht.count).toBe(0);
    expect(ht.hitTest(5, 1)).toBeNull();
  });

  it("hitTest works with multi-row regions", () => {
    const ht = new HitTester();
    ht.register({ id: "block", region: { x1: 1, y1: 1, x2: 10, y2: 5 }, hoverStyle: "underline", onClick: vi.fn() });
    expect(ht.hitTest(5, 3)?.id).toBe("block");
    expect(ht.hitTest(5, 6)).toBeNull();
  });
});
