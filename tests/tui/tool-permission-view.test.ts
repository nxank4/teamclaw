import { describe, it, expect, vi } from "vitest";
import { ToolPermissionView } from "../../src/tui/components/tool-permission-view.js";

describe("ToolPermissionView", () => {
  it("renders Y/n prompt for moderate risk", () => {
    const view = new ToolPermissionView("e1", "Write File", "src/auth.ts", "moderate", vi.fn(), vi.fn());
    const lines = view.render(80);
    expect(lines.some((l) => l.includes("[Y/n]"))).toBe(true);
    expect(lines.some((l) => l.includes("Write File"))).toBe(true);
  });

  it("shows description for dangerous risk", () => {
    const view = new ToolPermissionView("e1", "Run Command", "rm -rf dist/", "dangerous", vi.fn(), vi.fn());
    const lines = view.render(80);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.some((l) => l.includes("rm -rf dist/"))).toBe(true);
  });

  it('handleKey("y") calls onConfirm', () => {
    const onConfirm = vi.fn();
    const view = new ToolPermissionView("e1", "Test", "desc", "moderate", onConfirm, vi.fn());
    const handled = view.handleKey({ type: "char", char: "y" } as any);
    expect(handled).toBe(true);
    expect(onConfirm).toHaveBeenCalled();
  });

  it('handleKey("n") calls onReject', () => {
    const onReject = vi.fn();
    const view = new ToolPermissionView("e1", "Test", "desc", "moderate", vi.fn(), onReject);
    const handled = view.handleKey({ type: "char", char: "n" } as any);
    expect(handled).toBe(true);
    expect(onReject).toHaveBeenCalled();
  });

  it('handleKey("!") calls onConfirm for destructive', () => {
    const onConfirm = vi.fn();
    const view = new ToolPermissionView("e1", "Delete", "file.ts", "destructive", onConfirm, vi.fn());
    const handled = view.handleKey({ type: "char", char: "!" } as any);
    expect(handled).toBe(true);
    expect(onConfirm).toHaveBeenCalled();
  });

  it("ignores unrelated keys", () => {
    const view = new ToolPermissionView("e1", "Test", "desc", "moderate", vi.fn(), vi.fn());
    const handled = view.handleKey({ type: "char", char: "x" } as any);
    expect(handled).toBe(false);
  });

  it("isResolved true after confirm", () => {
    const view = new ToolPermissionView("e1", "Test", "desc", "moderate", vi.fn(), vi.fn());
    expect(view.isResolved).toBe(false);
    view.handleKey({ type: "char", char: "y" } as any);
    expect(view.isResolved).toBe(true);
  });
});
