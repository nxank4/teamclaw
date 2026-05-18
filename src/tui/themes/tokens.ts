/**
 * Public token API.
 *
 * Components call `tokens.chat.userText("hello")` — a nested Proxy that
 * walks the dotted path and returns a StyleFn resolved against the
 * currently-active palette. The Proxy's `get` traps dereference the
 * active palette at call time, so mid-session theme switches are
 * automatic — components do not need to re-import or subscribe.
 *
 * `withPalette(palette, fn)` builds a one-shot TokenTree bound to a
 * specific palette (used by `/themes` to render each preview row in
 * its own theme's colors without touching active state).
 */
import type { StyleFn } from "./style-fn.js";
import type { ComponentPath } from "./component-tokens.js";
import { COMPONENT_TO_SEMANTIC } from "./component-tokens.js";
import type { Palette } from "./semantic-tokens.js";
import { activePalette } from "./active.js";
import { resolveToken } from "./resolver.js";

// ── TokenTree shape ────────────────────────────────────────────────
// Hand-typed from component-tokens.ts. Misspelling any path fails tsc.

export interface TokenTree {
  chat: {
    userPrompt: StyleFn;
    userText: StyleFn;
    userPending: StyleFn;
    agentName: StyleFn;
    systemError: StyleFn;
    systemSuccess: StyleFn;
    systemHelp: StyleFn;
    systemDefault: StyleFn;
    toolInline: StyleFn;
    toolText: StyleFn;
    toolCountHint: StyleFn;
    collapseHint: StyleFn;
    taskBlockedGlyph: StyleFn;
    taskBlockedTail: StyleFn;
    errorPrefix: StyleFn;
  };
  tree: {
    connector: StyleFn;
    collapsedMore: StyleFn;
    thinking: StyleFn;
  };
  tool: {
    pending: StyleFn;
    running: StyleFn;
    completed: StyleFn;
    failed: StyleFn;
    aborted: StyleFn;
    durationLabel: StyleFn;
    errorSummary: StyleFn;
  };
  diff: {
    add: StyleFn;
    remove: StyleFn;
    context: StyleFn;
    collapsed: StyleFn;
  };
  agent: {
    coder: StyleFn;
    reviewer: StyleFn;
    planner: StyleFn;
    tester: StyleFn;
    debugger: StyleFn;
    researcher: StyleFn;
    assistant: StyleFn;
    fallback: StyleFn;
  };
  status: {
    dotActive: StyleFn;
    dotConfigured: StyleFn;
    dotOffline: StyleFn;
    dotError: StyleFn;
    dotReady: StyleFn;
    dotConnecting: StyleFn;
    spinnerDefault: StyleFn;
  };
  badge: {
    success: StyleFn;
    error: StyleFn;
    warning: StyleFn;
    info: StyleFn;
    pending: StyleFn;
  };
  picker: {
    itemSelected: StyleFn;
    itemUnselected: StyleFn;
    hint: StyleFn;
  };
  sticky: {
    divider: StyleFn;
    prefix: StyleFn;
    header: StyleFn;
    meta: StyleFn;
    statusPending: StyleFn;
    statusActive: StyleFn;
    statusDone: StyleFn;
    statusFailed: StyleFn;
    itemDetail: StyleFn;
    footer: StyleFn;
    spinner: StyleFn;
  };
  md: {
    h1: StyleFn;
    h2: StyleFn;
    h3: StyleFn;
    blockquoteBar: StyleFn;
    blockquoteText: StyleFn;
    bullet: StyleFn;
    numbered: StyleFn;
    langLabel: StyleFn;
    inlineCode: StyleFn;
    bold: StyleFn;
    link: StyleFn;
    tableSep: StyleFn;
  };
  panel: {
    border: StyleFn;
    title: StyleFn;
    footer: StyleFn;
    rowSelected: StyleFn;
    rowLabel: StyleFn;
    rowLabelDim: StyleFn;
    rowValue: StyleFn;
    rowValueDim: StyleFn;
  };
  ui: {
    editorBorder: StyleFn;
    editorPrompt: StyleFn;
    placeholder: StyleFn;
    fileTag: StyleFn;
    welcomeTitle: StyleFn;
    welcomeTagline: StyleFn;
    welcomeBorder: StyleFn;
    welcomeExample: StyleFn;
    welcomeHint: StyleFn;
    confirmDanger: StyleFn;
    confirmWarning: StyleFn;
    confirmText: StyleFn;
    confirmYes: StyleFn;
    separator: StyleFn;
    divider: StyleFn;
    thinking: StyleFn;
    resumeBanner: StyleFn;
    brandPrimary: StyleFn;
    brandAccent: StyleFn;
    textPrimary: StyleFn;
    textSecondary: StyleFn;
    textTertiary: StyleFn;
    bgElevated: StyleFn;
  };
}

// ── Proxy implementation ───────────────────────────────────────────

type TopLevel = keyof TokenTree;

const TOP_LEVELS: ReadonlySet<TopLevel> = new Set([
  "chat", "tree", "tool", "diff", "agent",
  "status", "badge", "picker", "sticky", "md", "panel", "ui",
]);

/**
 * Build a nested Proxy. The returned leaf StyleFns re-resolve against
 * `getPalette()` on every invocation, so components that cache a leaf
 * (e.g. `const fn = tokens.ui.divider`) still pick up a theme switch
 * without re-fetching. Internally `resolveToken` memoizes per
 * (paletteId, path), so steady-state cost is one map lookup + one
 * ANSI string concat — no measurable regression versus direct color
 * function access.
 */
function buildTree(getPalette: () => Palette): TokenTree {
  return new Proxy({} as TokenTree, {
    get(_target, group: string) {
      if (!TOP_LEVELS.has(group as TopLevel)) return undefined;
      return new Proxy({}, {
        get(_inner, leaf: string) {
          const path = `${group}.${leaf}` as ComponentPath;
          if (!(path in COMPONENT_TO_SEMANTIC)) {
            throw new Error(`Unknown component token: ${path}`);
          }
          return (s: string): string => resolveToken(path, getPalette())(s);
        },
      });
    },
  });
}

/** The live token tree. Reads from the currently-active palette every call. */
export const tokens: TokenTree = buildTree(activePalette);

/**
 * Run `fn` with a TokenTree bound to a specific palette, ignoring the
 * active state. Used by `/themes` to render each preview row in its
 * own theme's colors.
 */
export function withPalette<T>(palette: Palette, fn: (t: TokenTree) => T): T {
  const tree = buildTree(() => palette);
  return fn(tree);
}

// ── background helpers ────────────────────────────────────────────
// Components that paint a background (code blocks, selected rows) use
// these. Re-resolves against the active palette on each call.

type BgKey = keyof Palette["semantic"]["bg"];

function hexToTriple(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Wrap text in the named background color from the active palette. */
export function bgToken(key: BgKey): StyleFn {
  return (s: string): string => {
    const hex = activePalette().semantic.bg[key];
    const [r, g, b] = hexToTriple(hex);
    return `\x1b[48;2;${r};${g};${b}m${s}\x1b[49m`;
  };
}
