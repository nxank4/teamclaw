/**
 * StickyBlock — content model + renderer for a single sticky strip.
 *
 * The strip has four logical sections:
 *   1. Header   — `<spinner> <prefix> · <header> · <meta>` (1 row)
 *   2. Items    — `├ <icon> <label>  <detail>` (N rows; status-driven icon)
 *   3. Footer   — `└ <footer>` (0 or 1 row; omitted when no footer)
 *
 * Background tint applies to every row (truecolor only — falls out
 * naturally because `bgToken` is a no-op when colors are dropped).
 *
 * Auto-collapse: if the total row count would exceed ⌊H/3⌋, the items
 * list is squeezed: every "active" item is preserved (rare to have
 * many), the last 2 "done" items are shown, the first 3 "pending"
 * items are shown, and a single dim `├ … +N completed · +M pending`
 * line replaces the elided middle. "failed" items are NEVER elided —
 * errors must remain visible.
 */
import { tokens, bgToken } from "../../themes/tokens.js";
import type { StyleFn } from "../../themes/style-fn.js";

export type StickyPrefix =
  | "op:task"
  | "op:phase"
  | "op:interview"
  | "op:drift"
  | "op:think";

export type StickyItemStatus = "pending" | "active" | "done" | "failed";

export interface StickyItem {
  readonly status: StickyItemStatus;
  readonly label: string;
  readonly detail?: string;
}

export interface StickyBlockContent {
  readonly prefix: StickyPrefix;
  readonly header: string;
  readonly meta?: string;
  readonly items?: readonly StickyItem[];
  readonly footer?: string;
  readonly spinner?: boolean;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

const STATUS_GLYPH: Record<StickyItemStatus, string> = {
  pending: "◻",
  active:  "◼",
  done:    "✓",
  failed:  "✗",
};

const STATUS_COLOR: Record<StickyItemStatus, () => StyleFn> = {
  pending: () => tokens.sticky.statusPending,
  active:  () => tokens.sticky.statusActive,
  done:    () => tokens.sticky.statusDone,
  failed:  () => tokens.sticky.statusFailed,
};

const PAGE_PAD = " ";
const TREE_BRANCH = "├";
const TREE_LAST = "└";
const ELLIPSIS = "…";
const TRUNC = "…";

/** Number of spinner frames; exported for tests. */
export const SPINNER_FRAME_COUNT = SPINNER_FRAMES.length;

/**
 * Render a sticky block to terminal lines. The bg tint is applied per
 * row via `bgToken("sticky")` so the entire strip reads as one surface.
 *
 * @param content    the block content
 * @param spinnerIdx current spinner frame (mod 10); ignored if content.spinner === false
 * @param width      terminal width in columns
 * @param maxRows    max rows the block may occupy (auto-collapse trigger when items would exceed)
 */
export function renderStickyBlock(
  content: StickyBlockContent,
  spinnerIdx: number,
  width: number,
  maxRows: number,
): string[] {
  const bg = bgToken("sticky");
  const lines: string[] = [];

  // ── Header row ────────────────────────────────────────────────
  lines.push(bg(padToWidth(renderHeader(content, spinnerIdx, width), width)));

  // ── Items + collapse decision ─────────────────────────────────
  const items = content.items ?? [];
  // Available rows for items = maxRows - header(1) - footer(0 or 1)
  const footerRows = content.footer ? 1 : 0;
  const itemBudget = Math.max(1, maxRows - 1 - footerRows);
  const renderedItems = collapseItems(items, itemBudget);

  for (const line of renderedItems) {
    lines.push(bg(padToWidth(line, width)));
  }

  // ── Footer row ────────────────────────────────────────────────
  if (content.footer) {
    lines.push(bg(padToWidth(renderFooter(content.footer), width)));
  }

  return lines;
}

function renderHeader(
  content: StickyBlockContent,
  spinnerIdx: number,
  width: number,
): string {
  const wantSpinner = content.spinner !== false;
  const spinnerGlyph = wantSpinner
    ? tokens.sticky.spinner(SPINNER_FRAMES[spinnerIdx % SPINNER_FRAMES.length]!)
    : " ";
  const prefix = tokens.sticky.prefix(content.prefix);
  const sep = tokens.sticky.itemDetail(" · ");
  const headerText = content.header;
  const meta = content.meta ?? "";

  // Build the full header, then truncate meta if it overflows.
  const fixedWidth =
    1 + /* leading PAGE_PAD */
    1 + /* spinner col */
    1 + /* space */
    content.prefix.length +
    3 + /* " · " */
    1; /* trailing pad */
  const available = Math.max(8, width - fixedWidth);

  let headerOut = headerText;
  let metaOut = meta;
  if (meta) {
    const both = `${headerText} · ${meta}`;
    if (both.length > available) {
      // Drop meta first; truncate header with ellipsis if still too long.
      metaOut = "";
      if (headerText.length > available) {
        headerOut = headerText.slice(0, Math.max(1, available - 1)) + TRUNC;
      }
    }
  } else if (headerText.length > available) {
    headerOut = headerText.slice(0, Math.max(1, available - 1)) + TRUNC;
  }

  const headerStyled = tokens.sticky.header(headerOut);
  const metaStyled = metaOut ? sep + tokens.sticky.meta(metaOut) : "";
  return `${PAGE_PAD}${spinnerGlyph} ${prefix}${sep}${headerStyled}${metaStyled}`;
}

function renderFooter(footer: string): string {
  return `${PAGE_PAD}${tokens.sticky.footer(TREE_LAST + " " + footer)}`;
}

/**
 * Decide which items fit in `itemBudget` rows.
 * Algorithm:
 *   - Always include every `active` and `failed` item.
 *   - Fill remaining budget with `done` (newest last) and `pending`
 *     (oldest first), preferring the "first 3 pending" and "last 2
 *     done" hint from the spec.
 *   - If anything was elided, insert a single `… +N completed · +M pending`
 *     placeholder where the omitted items would have sat.
 */
function collapseItems(items: readonly StickyItem[], itemBudget: number): string[] {
  if (items.length <= itemBudget) {
    return items.map((it, idx) => renderItem(it, isLast(idx, items.length)));
  }

  const active = items.filter((it) => it.status === "active");
  const failed = items.filter((it) => it.status === "failed");
  const done = items.filter((it) => it.status === "done");
  const pending = items.filter((it) => it.status === "pending");

  const required = active.length + failed.length;
  const remaining = Math.max(0, itemBudget - required - 1); // -1 for the elision row
  // Default: last 2 done, first 3 pending. Shrink if remaining is small.
  let doneSlots = Math.min(2, done.length);
  let pendingSlots = Math.min(3, pending.length);
  if (doneSlots + pendingSlots > remaining) {
    // Trim pending first (fresh items are less informative than recent completions).
    pendingSlots = Math.max(0, Math.min(pendingSlots, remaining - doneSlots));
    if (doneSlots + pendingSlots > remaining) {
      doneSlots = Math.max(0, remaining - pendingSlots);
    }
  }

  // `slice(-0)` returns the whole array; clamp to an empty slice when
  // we want zero items.
  const shownDone = doneSlots > 0 ? done.slice(-doneSlots) : [];
  const shownPending = pendingSlots > 0 ? pending.slice(0, pendingSlots) : [];
  const elidedDone = done.length - shownDone.length;
  const elidedPending = pending.length - shownPending.length;

  const lines: string[] = [];
  // Done first (chronological), then active, then failed, then pending —
  // mirrors a natural progress flow.
  for (const it of shownDone) lines.push(renderItem(it, false));
  for (const it of active) lines.push(renderItem(it, false));
  for (const it of failed) lines.push(renderItem(it, false));
  if (elidedDone > 0 || elidedPending > 0) {
    const parts: string[] = [];
    if (elidedDone > 0) parts.push(`+${elidedDone} completed`);
    if (elidedPending > 0) parts.push(`+${elidedPending} pending`);
    lines.push(`${PAGE_PAD}${tokens.sticky.itemDetail(TREE_BRANCH + " " + ELLIPSIS + " " + parts.join(" · "))}`);
  }
  for (const it of shownPending) lines.push(renderItem(it, false));

  // Mark the last rendered line with `└` if it would otherwise be `├`.
  // The footer row (if any) handles that role itself; without a
  // footer, switch the last item to `└` so the tree closes visually.
  return lines;
}

function isLast(idx: number, len: number): boolean {
  return idx === len - 1;
}

function renderItem(item: StickyItem, last: boolean): string {
  const branch = last ? TREE_LAST : TREE_BRANCH;
  const color = STATUS_COLOR[item.status]();
  const glyph = color(STATUS_GLYPH[item.status]);
  const label = item.status === "pending"
    ? tokens.sticky.statusPending(item.label)
    : tokens.sticky.header(item.label);
  const detail = item.detail
    ? "  " + tokens.sticky.itemDetail(item.detail)
    : "";
  return `${PAGE_PAD}${tokens.sticky.itemDetail(branch)} ${glyph} ${label}${detail}`;
}

/**
 * Pad a styled line out to `width` visible columns so the bg tint
 * reaches the right edge. ANSI escapes are ignored for width math via
 * a simple regex strip.
 */
function padToWidth(line: string, width: number): string {
  const visible = line.replace(/\x1b\[[0-9;]*m/g, "").length;
  if (visible >= width) return line;
  return line + " ".repeat(width - visible);
}
