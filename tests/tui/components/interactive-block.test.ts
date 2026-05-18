/**
 * Unit tests for the InteractiveBlock<T> abstraction. No TUI required —
 * the block depends on a small InteractiveBlockDeps interface that's
 * faked here.
 */
import { describe, test, expect, beforeEach } from "bun:test";
import {
  InteractiveBlock,
  _resetActiveBlock,
  type InteractiveBlockDeps,
  type InteractiveBlockSpec,
} from "../../../src/tui/components/interactive-block/index.js";
import type { KeyEvent } from "../../../src/tui/core/input.js";

type Call =
  | { kind: "addMessage"; role: string; content: string; tag?: string }
  | { kind: "replaceByTag"; tag: string; content: string }
  | { kind: "removeLastByTag"; tag: string }
  | { kind: "pushKeyHandler" }
  | { kind: "popKeyHandler" }
  | { kind: "setStatusHint"; text: string }
  | { kind: "clearStatusHint" }
  | { kind: "requestRender" };

interface Harness {
  calls: Call[];
  /** Simulates the message stream — set true only if addMessage saw the tag. */
  hasMessage: () => boolean;
  deps: InteractiveBlockDeps;
  /** The keyboard handler the block pushed (if any). */
  handler: { handleKey: (e: KeyEvent) => boolean } | null;
}

function makeHarness(): Harness {
  const calls: Call[] = [];
  let messageExists = false;
  let activeHandler: { handleKey: (e: KeyEvent) => boolean } | null = null;
  const h: Harness = {
    calls,
    hasMessage: () => messageExists,
    handler: null,
    deps: {
      pushKeyHandler: (handler) => {
        calls.push({ kind: "pushKeyHandler" });
        activeHandler = handler;
        h.handler = handler;
      },
      popKeyHandler: () => {
        calls.push({ kind: "popKeyHandler" });
        activeHandler = null;
        h.handler = null;
      },
      requestRender: () => { calls.push({ kind: "requestRender" }); },
      addMessage: (role, content, options) => {
        calls.push({ kind: "addMessage", role, content, tag: options?.tag });
        if (options?.tag) messageExists = true;
      },
      replaceByTag: (tag, content) => {
        calls.push({ kind: "replaceByTag", tag, content });
        return messageExists;
      },
      removeLastByTag: (tag) => {
        calls.push({ kind: "removeLastByTag", tag });
        const had = messageExists;
        messageExists = false;
        return had;
      },
      setStatusHint: (text) => { calls.push({ kind: "setStatusHint", text }); },
      clearStatusHint: () => { calls.push({ kind: "clearStatusHint" }); },
    },
  };
  // Silence the lint complaint about activeHandler being assigned-but-not-read;
  // it's part of the closure that h.handler captures.
  void activeHandler;
  return h;
}

interface Item { id: string; label: string; }

const ITEMS: Item[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" },
];

function makeSpec(
  overrides: Partial<InteractiveBlockSpec<Item>> = {},
): { spec: InteractiveBlockSpec<Item>; selected: Item[]; cancelled: number } {
  const selected: Item[] = [];
  let cancelled = 0;
  const spec: InteractiveBlockSpec<Item> = {
    items: ITEMS,
    initialIndex: 0,
    tag: "op:test",
    statusHint: "test hint",
    render: (i) => [`row ${i}: ${ITEMS[i]?.label ?? "?"}`],
    onSelect: (item) => { selected.push(item); },
    onCancel: () => { cancelled++; },
    onFormatSelection: (item) => `selected ${item.id}`,
    ...overrides,
  };
  return { spec, selected, get cancelled() { return cancelled; } } as {
    spec: InteractiveBlockSpec<Item>;
    selected: Item[];
    cancelled: number;
  };
}

beforeEach(() => {
  _resetActiveBlock();
});

describe("mount", () => {
  test("emits initial block via addMessage, pushes handler, sets hint", () => {
    const h = makeHarness();
    const { spec } = makeSpec();
    new InteractiveBlock(spec, h.deps).mount();
    const kinds = h.calls.map((c) => c.kind);
    expect(kinds).toContain("addMessage");
    expect(kinds).toContain("pushKeyHandler");
    expect(kinds).toContain("setStatusHint");
    expect(kinds).toContain("requestRender");
    expect(h.handler).not.toBeNull();
  });

  test("clamps an out-of-range initialIndex into the valid range", () => {
    const h = makeHarness();
    const { spec } = makeSpec({ initialIndex: 99 });
    new InteractiveBlock(spec, h.deps).mount();
    const add = h.calls.find((c) => c.kind === "addMessage");
    expect(add).toBeDefined();
    expect((add as { content: string }).content).toContain("Gamma"); // last item
  });

  test("empty items: emits a single fallback line, does not push handler", () => {
    const h = makeHarness();
    const { spec } = makeSpec({ items: [] });
    new InteractiveBlock(spec, h.deps).mount();
    expect(h.calls.some((c) => c.kind === "pushKeyHandler")).toBe(false);
    expect(h.calls.some((c) => c.kind === "addMessage")).toBe(true);
  });

  test("mounting a second block unmounts the first (singleton)", () => {
    const h1 = makeHarness();
    const h2 = makeHarness();
    const { spec: s1 } = makeSpec({ tag: "op:first" });
    const { spec: s2 } = makeSpec({ tag: "op:second" });
    new InteractiveBlock(s1, h1.deps).mount();
    new InteractiveBlock(s2, h2.deps).mount();
    // first harness saw popKeyHandler when second mounted
    expect(h1.calls.some((c) => c.kind === "popKeyHandler")).toBe(true);
  });
});

describe("arrow navigation", () => {
  test("arrow down advances + wraps", () => {
    const h = makeHarness();
    const { spec } = makeSpec({ initialIndex: 2 });
    new InteractiveBlock(spec, h.deps).mount();
    h.handler!.handleKey({ type: "arrow", direction: "down", ctrl: false, alt: false });
    const replace = h.calls.find((c) => c.kind === "replaceByTag") as { content: string } | undefined;
    expect(replace).toBeDefined();
    expect(replace!.content).toContain("Alpha");
  });

  test("arrow up wraps from index 0 to last", () => {
    const h = makeHarness();
    const { spec } = makeSpec({ initialIndex: 0 });
    new InteractiveBlock(spec, h.deps).mount();
    h.handler!.handleKey({ type: "arrow", direction: "up", ctrl: false, alt: false });
    const replace = h.calls.find((c) => c.kind === "replaceByTag") as { content: string } | undefined;
    expect(replace!.content).toContain("Gamma");
  });

  test("'k' and 'j' chars work as ↑/↓ aliases", () => {
    const h = makeHarness();
    const { spec } = makeSpec({ initialIndex: 1 });
    new InteractiveBlock(spec, h.deps).mount();
    h.handler!.handleKey({ type: "char", char: "j", ctrl: false, alt: false, shift: false });
    h.handler!.handleKey({ type: "char", char: "k", ctrl: false, alt: false, shift: false });
    // Two replaceByTag calls; final should be back to Beta (1 → 2 → 1).
    const replaces = h.calls.filter((c) => c.kind === "replaceByTag") as Array<{ content: string }>;
    expect(replaces).toHaveLength(2);
    expect(replaces[1]!.content).toContain("Beta");
  });

  test("arrow left/right and other unhandled events do not advance", () => {
    const h = makeHarness();
    const { spec } = makeSpec();
    new InteractiveBlock(spec, h.deps).mount();
    const consumed = h.handler!.handleKey({ type: "arrow", direction: "left", ctrl: false, alt: false });
    expect(consumed).toBe(false);
  });
});

describe("page jumps", () => {
  test("PageDown / PageUp with < 5 items is a no-op (consumed but no move)", () => {
    const h = makeHarness();
    const { spec } = makeSpec({ initialIndex: 0 });
    new InteractiveBlock(spec, h.deps).mount();
    const before = h.calls.length;
    const consumed = h.handler!.handleKey({ type: "pagedown" });
    expect(consumed).toBe(true);
    // No replaceByTag emitted — items.length === 3 < 5.
    expect(h.calls.filter((c) => c.kind === "replaceByTag")).toHaveLength(0);
    expect(h.calls.length).toBe(before + 0); // nothing pushed
  });

  test("PageDown / PageUp with 8 items jumps 5, clamping at edges", () => {
    const h = makeHarness();
    const eight: Item[] = Array.from({ length: 8 }, (_, i) => ({ id: String(i), label: `Item ${i}` }));
    const { spec } = makeSpec({
      items: eight,
      initialIndex: 1,
      render: (i) => [`idx ${i}: ${eight[i]?.label}`],
    });
    new InteractiveBlock(spec, h.deps).mount();

    h.handler!.handleKey({ type: "pagedown" });   // 1 → 6
    h.handler!.handleKey({ type: "pagedown" });   // 6 → 7 (clamp)
    h.handler!.handleKey({ type: "pageup" });     // 7 → 2
    h.handler!.handleKey({ type: "pageup" });     // 2 → 0 (clamp)

    const replaces = h.calls.filter((c) => c.kind === "replaceByTag") as Array<{ content: string }>;
    expect(replaces).toHaveLength(4);
    expect(replaces[0]!.content).toContain("idx 6");
    expect(replaces[1]!.content).toContain("idx 7");
    expect(replaces[2]!.content).toContain("idx 2");
    expect(replaces[3]!.content).toContain("idx 0");
  });
});

describe("Enter (select)", () => {
  test("calls onSelect, pops handler, clears hint, replaces block with summary", async () => {
    const h = makeHarness();
    const { spec, selected } = makeSpec({ initialIndex: 1 });
    new InteractiveBlock(spec, h.deps).mount();
    h.handler!.handleKey({ type: "enter", shift: false });
    // onSelect is async; flush microtasks.
    await new Promise((r) => setImmediate(r));

    expect(selected).toEqual([ITEMS[1]!]);
    const kinds = h.calls.map((c) => c.kind);
    expect(kinds).toContain("popKeyHandler");
    expect(kinds).toContain("clearStatusHint");
    const lastReplace = [...h.calls].reverse().find((c) => c.kind === "replaceByTag") as { content: string } | undefined;
    expect(lastReplace?.content).toBe("selected b");
  });

  test("awaits an async onSelect before swapping in the summary", async () => {
    const h = makeHarness();
    let resolved = false;
    const slowSelect: InteractiveBlockSpec<Item>["onSelect"] = () =>
      new Promise<void>((r) => setTimeout(() => { resolved = true; r(); }, 5));
    const { spec } = makeSpec({ initialIndex: 0, onSelect: slowSelect });
    new InteractiveBlock(spec, h.deps).mount();
    h.handler!.handleKey({ type: "enter", shift: false });
    await new Promise((r) => setTimeout(r, 15));
    expect(resolved).toBe(true);
    const lastReplace = [...h.calls].reverse().find((c) => c.kind === "replaceByTag") as { content: string } | undefined;
    expect(lastReplace?.content).toBe("selected a");
  });
});

describe("Esc / Ctrl+C (cancel)", () => {
  test("Esc calls onCancel, removes the block, pops handler, clears hint", () => {
    const h = makeHarness();
    const cancellations: number[] = [];
    const { spec } = makeSpec({ onCancel: () => { cancellations.push(1); } });
    new InteractiveBlock(spec, h.deps).mount();
    h.handler!.handleKey({ type: "escape" });
    expect(cancellations).toEqual([1]);
    const kinds = h.calls.map((c) => c.kind);
    expect(kinds).toContain("removeLastByTag");
    expect(kinds).toContain("popKeyHandler");
    expect(kinds).toContain("clearStatusHint");
  });

  test("Esc without onCancel just removes the block without throwing", () => {
    const h = makeHarness();
    const { spec } = makeSpec({ onCancel: undefined });
    new InteractiveBlock(spec, h.deps).mount();
    h.handler!.handleKey({ type: "escape" });
    expect(h.calls.some((c) => c.kind === "removeLastByTag")).toBe(true);
  });

  test("Ctrl+C behaves like Esc", () => {
    const h = makeHarness();
    let cancelled = 0;
    const { spec } = makeSpec({ onCancel: () => { cancelled++; } });
    new InteractiveBlock(spec, h.deps).mount();
    h.handler!.handleKey({ type: "char", char: "c", ctrl: true, alt: false, shift: false });
    expect(cancelled).toBe(1);
  });
});

describe("`/` dismiss", () => {
  test("typing `/` cancels the picker but returns false so the editor receives it", () => {
    const h = makeHarness();
    let cancelled = 0;
    const { spec } = makeSpec({ onCancel: () => { cancelled++; } });
    new InteractiveBlock(spec, h.deps).mount();
    const consumed = h.handler!.handleKey({ type: "char", char: "/", ctrl: false, alt: false, shift: false });
    expect(consumed).toBe(false);
    expect(cancelled).toBe(1);
    expect(h.calls.some((c) => c.kind === "removeLastByTag")).toBe(true);
  });
});

describe("char pass-through", () => {
  test("regular letters return false (flow to editor) and don't move highlight", () => {
    const h = makeHarness();
    const { spec } = makeSpec({ initialIndex: 1 });
    new InteractiveBlock(spec, h.deps).mount();
    const consumed = h.handler!.handleKey({ type: "char", char: "x", ctrl: false, alt: false, shift: false });
    expect(consumed).toBe(false);
    expect(h.calls.filter((c) => c.kind === "replaceByTag")).toHaveLength(0);
  });
});
