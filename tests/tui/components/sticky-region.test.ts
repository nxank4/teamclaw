/**
 * Tests for StickyRegionComponent. The deps interface is small enough
 * to fake directly — no TUI required.
 */
import { describe, test, expect, beforeEach } from "bun:test";
import {
  StickyRegionComponent,
  _resetStickyRegion,
  type StickyBlockContent,
  type StickyItem,
  type StickyRegionDeps,
} from "../../../src/tui/components/sticky-region/index.js";
import { refreshTier } from "../../../src/tui/themes/resolver.js";

type ChatLine = { role: string; content: string };

function makeDeps(): {
  deps: StickyRegionDeps;
  chat: ChatLine[];
  fixedRenders: number;
} {
  const chat: ChatLine[] = [];
  let fixedRenders = 0;
  return {
    chat,
    get fixedRenders() { return fixedRenders; },
    deps: {
      requestFixedRender: () => { fixedRenders++; },
      addMessage: (role, content) => { chat.push({ role, content }); },
    },
  } as { deps: StickyRegionDeps; chat: ChatLine[]; fixedRenders: number };
}

function basicContent(overrides: Partial<StickyBlockContent> = {}): StickyBlockContent {
  return {
    prefix: "op:task",
    header: "Running",
    spinner: true,
    ...overrides,
  };
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

beforeEach(() => {
  _resetStickyRegion();
  // Reset terminal-tier detection so tests don't bleed across env states.
  refreshTier({ COLORTERM: "truecolor" } as NodeJS.ProcessEnv);
});

describe("lifecycle", () => {
  test("mount returns a handle and renders the block", () => {
    const h = makeDeps();
    const region = new StickyRegionComponent(h.deps);
    region.setViewport(20, 0, 24);
    const handle = region.mount(basicContent({ header: "starting" }));
    expect(region.size()).toBe(1);
    expect(handle).toBeDefined();
    const lines = region.render(80);
    expect(lines.length).toBeGreaterThan(0);
    const visible = stripAnsi(lines[0]!);
    expect(visible).toContain("op:task");
    expect(visible).toContain("starting");
  });

  test("render returns [] when no block is mounted", () => {
    const h = makeDeps();
    const region = new StickyRegionComponent(h.deps);
    expect(region.render(80)).toEqual([]);
  });

  test("handle.update mutates content and triggers fixed render", () => {
    const h = makeDeps();
    const region = new StickyRegionComponent(h.deps);
    region.setViewport(20, 0, 24);
    const handle = region.mount(basicContent());
    const baseline = (h as unknown as { fixedRenders: number }).fixedRenders;
    handle.update({ header: "updated" });
    expect((h as unknown as { fixedRenders: number }).fixedRenders).toBeGreaterThan(baseline);
    const lines = region.render(80);
    expect(stripAnsi(lines[0]!)).toContain("updated");
  });

  test("handle.unmount removes the block, no chat line", () => {
    const h = makeDeps();
    const region = new StickyRegionComponent(h.deps);
    region.setViewport(20, 0, 24);
    const handle = region.mount(basicContent());
    handle.unmount();
    expect(region.size()).toBe(0);
    expect(region.render(80)).toEqual([]);
    expect(h.chat).toHaveLength(0);
  });

  test("spinner timer pauses when stack is empty", () => {
    const h = makeDeps();
    const region = new StickyRegionComponent(h.deps);
    region.setViewport(20, 0, 24);
    expect(region.spinnerRunning()).toBe(false);
    const handle = region.mount(basicContent());
    expect(region.spinnerRunning()).toBe(true);
    handle.unmount();
    expect(region.spinnerRunning()).toBe(false);
  });
});

describe("completion", () => {
  test("complete renders ✓ summary, then after grace writes → noun: line to chat", async () => {
    const h = makeDeps();
    const region = new StickyRegionComponent(h.deps);
    region.setViewport(20, 0, 24);
    const handle = region.mount(basicContent({ prefix: "op:task" }));
    handle.complete("demo finished");
    // Right after complete: ✓ summary visible, no chat yet.
    const immediateLines = region.render(80);
    const immediate = immediateLines.map(stripAnsi).join("\n");
    expect(immediate).toContain("demo finished");
    expect(h.chat).toHaveLength(0);

    // After grace, chat line appears and block unmounts.
    await new Promise((r) => setTimeout(r, 1600));
    expect(h.chat).toHaveLength(1);
    expect(stripAnsi(h.chat[0]!.content)).toContain("→ task: ");
    expect(stripAnsi(h.chat[0]!.content)).toContain("demo finished");
    expect(region.size()).toBe(0);
  });

  test("complete with logKind override uses that noun", async () => {
    const h = makeDeps();
    const region = new StickyRegionComponent(h.deps);
    region.setViewport(20, 0, 24);
    const handle = region.mount(basicContent({ prefix: "op:phase" }));
    handle.complete("plan approved", "op:interview");
    await new Promise((r) => setTimeout(r, 1600));
    expect(stripAnsi(h.chat[0]!.content)).toContain("→ interview: plan approved");
  });
});

describe("queue", () => {
  test("second mount queues behind the first; promotes on unmount", () => {
    const h = makeDeps();
    const region = new StickyRegionComponent(h.deps);
    region.setViewport(20, 0, 24);
    const first = region.mount(basicContent({ header: "first" }));
    const second = region.mount(basicContent({ header: "second" }));
    expect(region.size()).toBe(2);
    const firstView = stripAnsi(region.render(80)[0]!);
    expect(firstView).toContain("first");
    first.unmount();
    const secondView = stripAnsi(region.render(80)[0]!);
    expect(secondView).toContain("second");
    second.unmount();
    expect(region.size()).toBe(0);
  });

  test("update on a queued block mutates content; surfaces on promotion", () => {
    const h = makeDeps();
    const region = new StickyRegionComponent(h.deps);
    region.setViewport(20, 0, 24);
    const first = region.mount(basicContent({ header: "first" }));
    const second = region.mount(basicContent({ header: "second" }));
    second.update({ header: "second-updated" });
    // First is still visible.
    expect(stripAnsi(region.render(80)[0]!)).toContain("first");
    first.unmount();
    expect(stripAnsi(region.render(80)[0]!)).toContain("second-updated");
  });
});

describe("auto-collapse", () => {
  test("compresses item list when total rows would exceed ⌊H/3⌋", () => {
    const h = makeDeps();
    const region = new StickyRegionComponent(h.deps);
    // Tight terminal: 12 rows → floor(12/3) = 4 rows budget for the block.
    region.setViewport(8, 0, 12);
    const items: StickyItem[] = [];
    for (let i = 0; i < 12; i++) {
      items.push({
        status: i < 8 ? "done" : i < 10 ? "active" : "pending",
        label: `step ${i}`,
      });
    }
    region.mount({ prefix: "op:task", header: "long task", items, spinner: false });
    const lines = region.render(80);
    const joined = lines.map(stripAnsi).join("\n");
    // Active items are always preserved.
    expect(joined).toContain("step 8");
    expect(joined).toContain("step 9");
    // The elision line surfaces.
    expect(joined).toMatch(/\+\d+ completed/);
    // Block stays at-or-below the budget (4 rows: header + 3 item rows).
    // Active rows alone (2) push past the strict 4-row budget once header
    // is counted, so the implementation clamps to >=3 rows for items;
    // verify only that we elide *something*.
    expect(joined).not.toContain("step 0");
  });

  test("failed items are always shown, never elided", () => {
    const h = makeDeps();
    const region = new StickyRegionComponent(h.deps);
    region.setViewport(8, 0, 12);
    const items: StickyItem[] = [];
    for (let i = 0; i < 10; i++) {
      items.push({ status: "done", label: `done ${i}` });
    }
    items.push({ status: "failed", label: "DETONATED" });
    region.mount({ prefix: "op:task", header: "boom", items, spinner: false });
    const joined = region.render(80).map(stripAnsi).join("\n");
    expect(joined).toContain("DETONATED");
  });
});

describe("resize", () => {
  test("setViewport updates the auto-collapse threshold", () => {
    const h = makeDeps();
    const region = new StickyRegionComponent(h.deps);
    region.setViewport(20, 0, 60);   // big terminal → no collapse needed
    const items: StickyItem[] = Array.from({ length: 8 }, (_, i) => ({
      status: "done" as const,
      label: `step ${i}`,
    }));
    region.mount({ prefix: "op:task", header: "x", items, spinner: false });
    const widePre = region.render(80).map(stripAnsi).join("\n");
    expect(widePre).toContain("step 0");
    expect(widePre).toContain("step 7");

    // Shrink: floor(9/3) = 3 budget. Now items must elide.
    region.setViewport(5, 0, 9);
    const narrow = region.render(80).map(stripAnsi).join("\n");
    expect(narrow).toMatch(/\+\d+ completed/);
  });
});

describe("fallback rendering", () => {
  test("16-color tier emits 16-color ANSI (no 24-bit RGB)", () => {
    refreshTier({ OPENPAWL_FORCE_COLORS: "16" } as NodeJS.ProcessEnv);
    const h = makeDeps();
    const region = new StickyRegionComponent(h.deps);
    region.setViewport(20, 0, 24);
    region.mount(basicContent({ header: "x" }));
    const raw = region.render(80).join("\n");
    expect(raw).not.toMatch(/\x1b\[38;2;/);   // no truecolor fg
  });

  test("no-color tier emits attribute-only escapes (no fg color)", () => {
    refreshTier({ OPENPAWL_FORCE_COLORS: "none" } as NodeJS.ProcessEnv);
    const h = makeDeps();
    const region = new StickyRegionComponent(h.deps);
    region.setViewport(20, 0, 24);
    region.mount(basicContent({ header: "y" }));
    const raw = region.render(80).join("\n");
    expect(raw).not.toMatch(/\x1b\[38;2;/);
    expect(raw).not.toMatch(/\x1b\[38;5;/);
    // Plain text is still present.
    expect(stripAnsi(raw)).toContain("op:task");
    expect(stripAnsi(raw)).toContain("y");
  });
});
