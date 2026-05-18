/**
 * /sticky-demo — manual exerciser for the StickyRegionComponent.
 *
 * Gated behind OPENPAWL_DEBUG=true so it doesn't leak into the
 * production command list. Mounts a block with 5 items, cycles each
 * pending → active → done over ~10s, then completes with a summary
 * that lands in chat via the "→ <noun>: <value>" convention.
 *
 * Used to visually verify: spinner cadence, status glyphs, bg tint,
 * tree connectors, completion grace, fallback colors (with env
 * overrides), and auto-collapse (mount a longer item list manually).
 */
import type { SlashCommand } from "../../tui/index.js";
import { getStickyRegion, type StickyBlockHandle, type StickyItem } from "../../tui/components/sticky-region/index.js";

const STEP_MS = 800;

interface DemoStep {
  label: string;
  detail?: string;
}

const DEMO_STEPS: readonly DemoStep[] = [
  { label: "Scanning repo",       detail: "742 files" },
  { label: "Building call graph", detail: "1.2k nodes" },
  { label: "Inferring intent" },
  { label: "Drafting changes",    detail: "5 files" },
  { label: "Running checks",      detail: "lint · typecheck · tests" },
];

export function createStickyDemoCommand(): SlashCommand {
  return {
    name: "sticky-demo",
    description: "Manual exerciser for the sticky region (debug only)",
    hidden: true,
    async execute(_args, _ctx) {
      const sticky = getStickyRegion();
      const items: StickyItem[] = DEMO_STEPS.map((s) => ({
        status: "pending",
        label: s.label,
        detail: s.detail,
      }));
      const handle = sticky.mount({
        prefix: "op:task",
        header: "demo task",
        meta: "0s",
        items,
        footer: `${items.length} pending`,
        spinner: true,
      });

      const start = Date.now();
      let cursor = 0;
      const tick = setInterval(() => {
        const elapsed = Math.round((Date.now() - start) / 1000);
        if (cursor >= items.length) {
          clearInterval(tick);
          completeDemo(handle, elapsed, items.length);
          return;
        }
        advanceCursor(items, cursor);
        cursor++;
        const remaining = items.filter((it) => it.status !== "done").length;
        handle.update({
          items: items.slice(),
          meta: `${elapsed}s`,
          footer: remaining > 0 ? `${remaining} remaining` : "complete",
        });
      }, STEP_MS);
      if (tick.unref) tick.unref();
    },
  };
}

function advanceCursor(items: StickyItem[], cursor: number): void {
  // Flip the previous step's "active" to "done" first.
  if (cursor > 0) {
    items[cursor - 1] = { ...items[cursor - 1]!, status: "done" };
  }
  // Mark the new cursor "active".
  items[cursor] = { ...items[cursor]!, status: "active" };
}

function completeDemo(handle: StickyBlockHandle, elapsedSec: number, stepCount: number): void {
  handle.complete(`demo finished · ${elapsedSec}s · ${stepCount} steps`, "op:task");
}
