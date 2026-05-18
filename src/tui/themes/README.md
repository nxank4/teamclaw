# Theme tokens (3-layer system)

This directory is the single source of truth for color in the OpenPawl
TUI. Components never reach for hex values or named ANSI colors — they
go through the `tokens` API, which routes through three explicit layers.

```
                  ┌─────────────────────────────────────────┐
                  │  Layer 3 — Component tokens             │
                  │  "chat.userText"  "tool.running"  ...   │  ← what callers use
                  └─────────────────────┬───────────────────┘
                                        │  (component-tokens.ts)
                                        ▼
                  ┌─────────────────────────────────────────┐
                  │  Layer 2 — Semantic tokens              │
                  │  text.primary  status.info  bg.code ... │  ← contract every theme satisfies
                  └─────────────────────┬───────────────────┘
                                        │  (semantic-tokens.ts)
                                        ▼
        ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
        │  pawlwinkle.ts   │  │   pawlbon.ts     │  │ catppuccin-mocha.ts  │
        │  hex + ansi16    │  │   hex + ansi16   │  │  hex + ansi16        │
        └──────────────────┘  └──────────────────┘  └──────────────────────┘
                  Layer 1 — Per-theme palette (palettes/)
```

## Files

| File                  | Purpose                                            |
|-----------------------|----------------------------------------------------|
| `semantic-tokens.ts`  | `SemanticPalette` shape — the 28-key contract.    |
| `component-tokens.ts` | Alias map: `"chat.userText" → "text.primary"`.    |
| `tokens.ts`           | `tokens` Proxy, `withPalette()`, `bgToken()`.     |
| `resolver.ts`         | Tier detection, hex→256 quantizer, memo cache.    |
| `fallback.ts`         | ANSI-16 fn table + NO_COLOR attribute map.        |
| `active.ts`           | Active palette state + `setActivePalette()`.      |
| `theme-engine.ts`     | Singleton: registers palettes, switches active.   |
| `palettes/*.ts`       | One file per theme — hex + ANSI-16 fallback map.  |
| `default.ts`          | Legacy `Theme` shim (slated for removal).         |

## Do / don't

**DO:** call tokens directly at render sites.

```ts
import { tokens } from "../themes/tokens.js";

lines.push(tokens.chat.userText(message));        // ✓
lines.push("  " + tokens.tree.connector("├─"));   // ✓
lines.push(tokens.tool.failed(ICONS.error));      // ✓
```

**DON'T:** import the raw palette or use named ANSI colors.

```ts
import { ctp } from "../themes/default.js";       // ✗ banned by eslint
import chalk from "chalk";                          // ✗ banned by eslint
import { red, green } from "../core/ansi.js";      // ✗ defeats the system

lines.push(ctp.mauve(message));                    // ✗
lines.push(red("error"));                          // ✗
lines.push("\x1b[38;2;255;0;0merror\x1b[39m");    // ✗
```

**DON'T:** put raw hex values anywhere outside `palettes/*.ts`.

```ts
const HIGHLIGHT = "#cba6f7";                       // ✗ banned by eslint
```

## Adding a new component token

1. Add a row to `component-tokens.ts` mapping your component path to a
   semantic path that already exists (or add a semantic key first, but
   that's much rarer — every palette has to update).
2. Add the leaf to the `TokenTree` interface in `tokens.ts` (typescript
   will warn you if you forget).
3. Use `tokens.<group>.<leaf>` at the callsite.

## Adding a new theme

1. Create `palettes/<id>.ts` exporting a `Palette` with `semantic` and
   `ansi16` for every key in `SemanticPalette`.
2. Add the file to the `PaletteId` union in `semantic-tokens.ts`.
3. Register it in `palettes/index.ts` (`getBuiltInPalettes()` array +
   `PALETTE_DESCRIPTIONS`).

## Terminal capability tiers

| Tier        | When                                             | Source              |
|-------------|--------------------------------------------------|---------------------|
| `truecolor` | `COLORTERM=truecolor` or `24bit`                  | hex → 24-bit RGB    |
| `256`       | `TERM` contains `256color`                       | hex → xterm-256 cube|
| `16`        | otherwise                                        | per-palette `ansi16`|
| `none`      | `NO_COLOR=1` set                                  | bold/dim/inverse only|

Override with `OPENPAWL_FORCE_COLORS={truecolor,256,16,none}`.

## Slash commands

- `/theme <name>` — switch active theme (writes `~/.openpawl/config.json`).
- `/theme` (no args) — same as `/themes`.
- `/themes` — render the `op:themes` block with live color previews of
  every available theme.

The current valid theme ids are `pawlwinkle` (default), `pawlbon`,
and `catppuccin-mocha`.
