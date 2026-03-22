/**
 * Searchable select prompt built on @clack/core.
 * Drop-in replacement for @clack/prompts `select` with type-ahead filtering.
 */
import { Prompt } from "@clack/core";
import pc from "picocolors";

// ── ANSI-aware string truncation ────────────────────────────────────────────

const ANSI_RE = /\x1b\[[0-9;]*m/g;

/** Strip ANSI escape codes and return visual width (assumes 1 char = 1 col). */
function visualWidth(s: string): number {
    return s.replace(ANSI_RE, "").length;
}

/**
 * Truncate a string to `maxCols` visual columns, preserving ANSI codes
 * that start before the cut-off. Appends "…" when truncated.
 */
export function truncateAnsi(s: string, maxCols: number): string {
    if (maxCols <= 0) return "";
    if (visualWidth(s) <= maxCols) return s;

    let vis = 0;
    let i = 0;
    const target = maxCols - 1; // reserve 1 col for "…"
    while (i < s.length && vis < target) {
        if (s[i] === "\x1b") {
            // skip entire ANSI sequence
            const end = s.indexOf("m", i);
            if (end !== -1) { i = end + 1; continue; }
        }
        vis++;
        i++;
    }
    // include any trailing ANSI codes so colours are properly closed
    while (i < s.length && s[i] === "\x1b") {
        const end = s.indexOf("m", i);
        if (end === -1) break;
        i = end + 1;
    }
    return s.slice(0, i) + "…";
}

// ── Clack-matching unicode glyphs ────────────────────────────────────────────
function supportsUnicode(): boolean {
    if (process.platform !== "win32") return process.env.TERM !== "linux";
    return (
        !!process.env.CI ||
        !!process.env.WT_SESSION ||
        process.env.TERM_PROGRAM === "vscode" ||
        process.env.TERM === "xterm-256color"
    );
}
const u = supportsUnicode();
const S_STEP_ACTIVE = u ? "\u25C6" : "*";
const S_STEP_CANCEL = u ? "\u25A0" : "x";
const S_STEP_ERROR = u ? "\u25B2" : "x";
const S_STEP_SUBMIT = u ? "\u25C7" : "o";
const S_BAR = u ? "\u2502" : "|";
const S_BAR_END = u ? "\u2514" : "\u2014";
const S_RADIO_ACTIVE = u ? "\u25CF" : ">";
const S_RADIO_INACTIVE = u ? "\u25CB" : " ";

function stateSymbol(state: string): string {
    switch (state) {
        case "initial":
        case "active":
            return pc.cyan(S_STEP_ACTIVE);
        case "cancel":
            return pc.red(S_STEP_CANCEL);
        case "error":
            return pc.yellow(S_STEP_ERROR);
        case "submit":
            return pc.green(S_STEP_SUBMIT);
        default:
            return pc.cyan(S_STEP_ACTIVE);
    }
}

// ── Types ────────────────────────────────────────────────────────────────────
export interface SearchableOption {
    value: string;
    label: string;
    hint?: string;
}

export interface SearchableSelectOptions {
    message: string;
    options: SearchableOption[];
    maxItems?: number;
    placeholder?: string;
}

/**
 * Clamp select option labels/hints so they don't wrap in the terminal.
 * Accounts for clack's prefix (~6 visual cols: "│  ● ") and hint parens.
 * Works with both `@clack/prompts` select and `searchableSelect`.
 */
export function clampSelectOptions<T extends { label: string; hint?: string }>(
    options: T[],
): T[] {
    const cols = process.stdout.columns || 80;
    // clack prefix "│  ● " = 5, plus 1 space before hint paren = 6
    const overhead = 6;
    return options.map((opt) => {
        let label = opt.label;
        let hint = opt.hint;

        if (hint) {
            // "label (hint)" — overhead includes " (" + ")" = 3 chars
            const totalVis = visualWidth(label) + 3 + visualWidth(hint) + overhead;
            if (totalVis > cols) {
                // First try to shorten the hint
                const availHint = cols - overhead - visualWidth(label) - 3;
                if (availHint > 10) {
                    hint = truncateAnsi(hint, availHint);
                } else {
                    // Hint too small — truncate the label and drop hint
                    const maxLabel = cols - overhead - 1;
                    label = truncateAnsi(label, maxLabel);
                    hint = undefined;
                }
            }
        } else if (visualWidth(label) + overhead > cols) {
            const maxLabel = cols - overhead - 1;
            label = truncateAnsi(label, maxLabel);
        }

        return { ...opt, label, hint };
    });
}

// ── Scrollable option rendering (matches clack's internal algorithm) ─────────
function renderScrollableOptions(opts: {
    filtered: SearchableOption[];
    cursor: number;
    maxItems: number;
    barColor: (s: string) => string;
}): string[] {
    const { filtered, cursor, barColor } = opts;
    if (filtered.length === 0) return [`${barColor(S_BAR)}  ${pc.dim("No matches")}`];

    const termRows = Math.max(process.stdout.rows - 6, 5);
    const maxVisible = Math.min(termRows, Math.max(opts.maxItems, 5));

    let start = 0;
    if (cursor >= start + maxVisible - 3)
        start = Math.max(Math.min(cursor - maxVisible + 3, filtered.length - maxVisible), 0);
    else if (cursor < start + 2) start = Math.max(cursor - 2, 0);

    const hasAbove = maxVisible < filtered.length && start > 0;
    const hasBelow = maxVisible < filtered.length && start + maxVisible < filtered.length;

    const cols = process.stdout.columns || 80;

    return filtered.slice(start, start + maxVisible).map((opt, i, arr) => {
        const isFirst = i === 0 && hasAbove;
        const isLast = i === arr.length - 1 && hasBelow;
        if (isFirst || isLast) return `${barColor(S_BAR)}  ${pc.dim("...")}`;

        const active = i + start === cursor;
        const label = opt.label ?? String(opt.value);
        const formatted = active
            ? `${pc.green(S_RADIO_ACTIVE)} ${label} ${opt.hint ? pc.dim(`(${opt.hint})`) : ""}`
            : `${pc.dim(S_RADIO_INACTIVE)} ${pc.dim(label)}`;
        const line = `${barColor(S_BAR)}  ${formatted}`;
        return visualWidth(line) > cols ? truncateAnsi(line, cols) : line;
    });
}

// ── Main export ──────────────────────────────────────────────────────────────
export async function searchableSelect(
    opts: SearchableSelectOptions,
): Promise<string | symbol> {
    let listCursor = 0;
    let search = "";
    let filtered: SearchableOption[] = opts.options;

    function updateFilter(query: string) {
        const term = query.toLowerCase();
        filtered = term
            ? opts.options.filter(
                  (o) =>
                      o.label.toLowerCase().includes(term) ||
                      (o.hint?.toLowerCase().includes(term) ?? false),
              )
            : opts.options;
        if (listCursor >= filtered.length) listCursor = Math.max(0, filtered.length - 1);
    }

    const maxItems = opts.maxItems ?? 12;

    const p = new Prompt(
        {
            render() {
                const title = `${pc.gray(S_BAR)}\n${stateSymbol(this.state)}  ${opts.message}\n`;

                switch (this.state) {
                    case "submit": {
                        const selected = filtered[listCursor];
                        return `${title}${pc.gray(S_BAR)}  ${pc.dim(selected?.label ?? "")}`;
                    }
                    case "cancel": {
                        const selected = filtered[listCursor];
                        return `${title}${pc.gray(S_BAR)}  ${pc.strikethrough(pc.dim(selected?.label ?? ""))}\n${pc.gray(S_BAR)}`;
                    }
                    case "error": {
                        const searchLine = `${pc.yellow(S_BAR)}  ${pc.dim("/")} ${search}${pc.inverse(" ")}`;
                        const lines = renderScrollableOptions({
                            filtered,
                            cursor: listCursor,
                            maxItems,
                            barColor: pc.yellow,
                        });
                        return [
                            title.trimEnd(),
                            searchLine,
                            ...lines,
                            `${pc.yellow(S_BAR_END)}  ${pc.yellow(this.error)}`,
                            "",
                        ].join("\n");
                    }
                    default: {
                        const placeholder = opts.placeholder ?? "Type to filter...";
                        const searchDisplay = search
                            ? `${search}${pc.inverse(" ")}`
                            : `${pc.inverse(placeholder[0])}${pc.dim(placeholder.slice(1))}`;
                        const searchLine = `${pc.cyan(S_BAR)}  ${pc.dim("/")} ${searchDisplay}`;
                        const lines = renderScrollableOptions({
                            filtered,
                            cursor: listCursor,
                            maxItems,
                            barColor: pc.cyan,
                        });
                        return [title.trimEnd(), searchLine, ...lines, `${pc.cyan(S_BAR_END)}`, ""].join("\n");
                    }
                }
            },
            validate() {
                if (filtered.length === 0) return "No matches. Press backspace to clear filter.";
            },
        },
        true, // trackValue: enables text input tracking
    );

    // Text input → update search filter
    p.on("value", () => {
        search = String(p.value ?? "");
        updateFilter(search);
    });

    // Arrow keys → navigate filtered list
    p.on("cursor", (action) => {
        if (action === "up")
            listCursor = listCursor <= 0 ? filtered.length - 1 : listCursor - 1;
        if (action === "down")
            listCursor = listCursor >= filtered.length - 1 ? 0 : listCursor + 1;
    });

    // On submit → replace text value with selected option value
    p.on("finalize", () => {
        if (p.state === "submit") {
            p.value = filtered[listCursor]?.value ?? opts.options[0]?.value;
        }
    });

    return p.prompt() as Promise<string | symbol>;
}
