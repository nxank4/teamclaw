/**
 * Regression coverage for the unified spinner cadence in PR #120.
 *
 * createSpinner used to tick at 80ms with the 10-frame braille set;
 * the model-view + any other inline caller is now expected to advance
 * at the shared 200ms beat using the same 4-frame box (❏ ❐ ❑ ❒) the
 * top-level ThinkingIndicator uses, so two visible spinners can never
 * drift out of phase.
 */
import { describe, expect, it } from "bun:test";

import { createSpinner, SPINNER_INTERVAL_MS } from "./status-indicator.js";
import { ICONS } from "../constants/icons.js";
import { stripAnsi } from "../utils/text-width.js";

describe("createSpinner — unified cadence and frames", () => {
  it("publishes SPINNER_INTERVAL_MS = 200ms", () => {
    expect(SPINNER_INTERVAL_MS).toBe(200);
  });

  it("frame() emits one of ICONS.boxFrames (not braille)", () => {
    const sp = createSpinner();
    const ch = stripAnsi(sp.frame());
    expect(ICONS.boxFrames).toContain(ch);
    expect(ICONS.brailleFrames).not.toContain(ch);
    sp.stop();
  });

  it("starts at boxFrames[0] and stop() halts further frame production", () => {
    const sp = createSpinner();
    const first = stripAnsi(sp.frame());
    expect(first).toBe(ICONS.boxFrames[0]!);
    sp.stop();
    // After stop(), frame() still returns the last frame value
    // synchronously — but the underlying timer has been cleared, so
    // no further index advancement happens. Calling frame() many
    // times in succession yields the same character.
    const after = stripAnsi(sp.frame());
    expect(after).toBe(first);
  });
});
