import { describe, it, expect, vi } from "vitest";
import { HoverManager } from "../../../src/tui/mouse/hover-manager.js";
import { HitTester } from "../../../src/tui/mouse/hit-test.js";

describe("HoverManager", () => {
  function setup() {
    const ht = new HitTester();
    const hm = new HoverManager();
    const renderSpy = vi.fn();
    const tooltipSpy = vi.fn();
    hm.onRequestRender = renderSpy;
    hm.onTooltip = tooltipSpy;
    return { ht, hm, renderSpy, tooltipSpy };
  }

  it("onMouseMove calls onHover when entering element", () => {
    const { ht, hm } = setup();
    const onHover = vi.fn();
    ht.register({ id: "a", region: { x1: 1, y1: 1, x2: 10, y2: 1 }, hoverStyle: "underline", onClick: vi.fn(), onHover });
    hm.onMouseMove(5, 1, ht);
    expect(onHover).toHaveBeenCalledOnce();
  });

  it("onMouseMove calls onLeave when leaving element", () => {
    const { ht, hm } = setup();
    const onLeave = vi.fn();
    ht.register({ id: "a", region: { x1: 1, y1: 1, x2: 10, y2: 1 }, hoverStyle: "underline", onClick: vi.fn(), onLeave });
    hm.onMouseMove(5, 1, ht); // enter
    hm.onMouseMove(20, 1, ht); // leave
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it("onClick calls element.onClick", () => {
    const { ht, hm } = setup();
    const onClick = vi.fn();
    ht.register({ id: "a", region: { x1: 1, y1: 1, x2: 10, y2: 1 }, hoverStyle: "underline", onClick });
    const handled = hm.onClick(5, 1, ht);
    expect(handled).toBe(true);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("onClick returns false for empty space", () => {
    const { ht, hm } = setup();
    expect(hm.onClick(50, 50, ht)).toBe(false);
  });

  it("no event fired when moving within same element", () => {
    const { ht, hm, renderSpy } = setup();
    const onHover = vi.fn();
    ht.register({ id: "a", region: { x1: 1, y1: 1, x2: 10, y2: 1 }, hoverStyle: "underline", onClick: vi.fn(), onHover });
    hm.onMouseMove(3, 1, ht);
    hm.onMouseMove(7, 1, ht); // still same element
    expect(onHover).toHaveBeenCalledTimes(1); // only once on enter
    expect(renderSpy).toHaveBeenCalledTimes(1); // only the initial enter
  });

  it("moving from one element to another fires leave then hover", () => {
    const { ht, hm } = setup();
    const leaveA = vi.fn();
    const hoverB = vi.fn();
    ht.register({ id: "a", region: { x1: 1, y1: 1, x2: 5, y2: 1 }, hoverStyle: "underline", onClick: vi.fn(), onLeave: leaveA });
    ht.register({ id: "b", region: { x1: 10, y1: 1, x2: 15, y2: 1 }, hoverStyle: "underline", onClick: vi.fn(), onHover: hoverB });
    hm.onMouseMove(3, 1, ht); // enter A
    hm.onMouseMove(12, 1, ht); // leave A, enter B
    expect(leaveA).toHaveBeenCalledOnce();
    expect(hoverB).toHaveBeenCalledOnce();
  });

  it("isHovered returns correct state", () => {
    const { ht, hm } = setup();
    ht.register({ id: "a", region: { x1: 1, y1: 1, x2: 10, y2: 1 }, hoverStyle: "underline", onClick: vi.fn() });
    expect(hm.isHovered("a")).toBe(false);
    hm.onMouseMove(5, 1, ht);
    expect(hm.isHovered("a")).toBe(true);
  });

  it("tooltip shown on hover, cleared on leave", () => {
    const { ht, hm, tooltipSpy } = setup();
    ht.register({ id: "a", region: { x1: 1, y1: 1, x2: 10, y2: 1 }, hoverStyle: "underline", onClick: vi.fn(), tooltip: "Click to open" });
    hm.onMouseMove(5, 1, ht);
    expect(tooltipSpy).toHaveBeenCalledWith("Click to open");
    hm.onMouseMove(50, 50, ht);
    expect(tooltipSpy).toHaveBeenCalledWith(null);
  });

  it("disable prevents hover events", () => {
    const { ht, hm } = setup();
    const onHover = vi.fn();
    ht.register({ id: "a", region: { x1: 1, y1: 1, x2: 10, y2: 1 }, hoverStyle: "underline", onClick: vi.fn(), onHover });
    hm.disable();
    hm.onMouseMove(5, 1, ht);
    expect(onHover).not.toHaveBeenCalled();
  });
});
