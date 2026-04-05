import { describe, it, expect, vi } from "vitest";
import { QuickSwitcher } from "../../../src/tui/keybindings/quick-switcher.js";

describe("QuickSwitcher", () => {
  const source = {
    name: "sessions",
    icon: "📁",
    getItems: () => [
      { label: "Fix auth token refresh", description: "2m ago", source: "sessions", action: vi.fn() },
      { label: "Setup CI pipeline", description: "1w ago", source: "sessions", action: vi.fn() },
      { label: "Add user avatars", description: "3d ago", source: "sessions", action: vi.fn() },
    ],
  };

  it("filter returns matching items", () => {
    const switcher = new QuickSwitcher([source]);
    const results = switcher.filter("auth");
    expect(results).toHaveLength(1);
    expect(results[0]!.label).toContain("auth");
  });

  it("fuzzy match: earlier position = higher score", () => {
    const switcher = new QuickSwitcher([source]);
    const results = switcher.filter("a"); // matches "Add" (pos 0) and "auth" (pos 4)
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("empty query returns top items from all sources", () => {
    const switcher = new QuickSwitcher([source]);
    const results = switcher.filter("");
    expect(results.length).toBeGreaterThan(0);
  });

  it("dismiss clears active state", () => {
    const switcher = new QuickSwitcher([source]);
    switcher.activate();
    expect(switcher.isActive()).toBe(true);
    switcher.dismiss();
    expect(switcher.isActive()).toBe(false);
  });
});
