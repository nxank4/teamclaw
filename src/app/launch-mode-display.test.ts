/**
 * Regression for the `openpawl --mode crew` chip-on-launch bug.
 *
 * Two cooperating bugs caused the previous fix to fail:
 *
 * Bug 1 — StatusBarComponent.updateSegment silently no-ops when
 *         segments have not been initialized via setSegments().
 *         See status-bar.ts:111 — the `this.segments && ...` gate.
 *
 * Bug 2 — config-wiring.ts:31 hardcodes the mode chip to "solo" via
 *         setSegments(), and that call happens INSIDE
 *         setupConfigAndProviders, AFTER launchTUI's mode-system
 *         init block. Any updateModeDisplay() call placed before
 *         setupConfigAndProviders is swallowed by Bug 1 and
 *         immediately overwritten by Bug 2.
 *
 * These tests pin the cause-and-effect so a future re-ordering of
 * launchTUI cannot silently break the chip again.
 */
import { describe, expect, it } from "bun:test";
import { StatusBarComponent } from "../tui/components/status-bar.js";
import { AppModeSystem } from "../tui/keybindings/app-mode.js";
import { defaultTheme } from "../tui/themes/default.js";
import { ICONS } from "../tui/constants/icons.js";
import { DOT_SYMBOL } from "../tui/components/status-indicator.js";

function strip(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("mode chip wiring", () => {
  it("updateSegment is a silent no-op when called before setSegments (the trap)", () => {
    // This is why the first attempted fix at index.ts:107 didn't work.
    // segments is null until setSegments() runs, so updateSegment short-
    // circuits without writing anything.
    const bar = new StatusBarComponent("test");
    bar.updateSegment(2, "⚡ crew", defaultTheme.accent);
    const out = strip(bar.render(80)[0] ?? "");
    expect(out).not.toContain("crew");
  });

  it("after setSegments, updateModeDisplay-equivalent flips the chip from the hardcoded 'solo' to crew", () => {
    // Reproduces the exact wiring contract: setSegments first
    // (config-wiring.ts:31), then a post-init updateSegment(2, ...)
    // driven by AppModeSystem.getModeInfo(). The crew chip must
    // win the race against the hardcoded "solo" default.
    const bar = new StatusBarComponent("test");
    bar.setLayoutProvider(() => ({ breakpoint: "md" }) as never);
    const appMode = new AppModeSystem("crew");
    bar.setSegments([
      { text: "no provider", color: defaultTheme.secondary },
      { text: `${DOT_SYMBOL.empty} not configured`, color: defaultTheme.error },
      { text: `${ICONS.modeSolo} solo`, color: defaultTheme.dim },
      { text: "idle", color: defaultTheme.dim },
      { text: "", color: defaultTheme.dim },
    ]);
    const info = appMode.getModeInfo();
    bar.updateSegment(2, `${info.icon} ${info.shortName}`, info.color);
    const out = strip(bar.render(80)[0] ?? "");
    expect(out).toContain("crew");
    expect(out).not.toMatch(/[│|]\s*[^c]?\s*solo\s/);
  });

  it("solo launch keeps the default chip — call is idempotent and safe", () => {
    const bar = new StatusBarComponent("test");
    bar.setLayoutProvider(() => ({ breakpoint: "md" }) as never);
    const appMode = new AppModeSystem("solo");
    bar.setSegments([
      { text: "no provider", color: defaultTheme.secondary },
      { text: `${DOT_SYMBOL.empty} not configured`, color: defaultTheme.error },
      { text: `${ICONS.modeSolo} solo`, color: defaultTheme.dim },
      { text: "idle", color: defaultTheme.dim },
      { text: "", color: defaultTheme.dim },
    ]);
    const info = appMode.getModeInfo();
    bar.updateSegment(2, `${info.icon} ${info.shortName}`, info.color);
    const out = strip(bar.render(80)[0] ?? "");
    expect(out).toContain("solo");
    expect(out).not.toContain("crew");
  });
});
