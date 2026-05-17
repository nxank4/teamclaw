import { describe, expect, it } from "bun:test";

import {
  PHASE_SEGMENT_INDEX,
  phaseLabel,
  refreshPhaseSegment,
  renderPhaseSegment,
} from "../../src/app/phase-display.js";
import { stripAnsi } from "../../src/tui/utils/text-width.js";

describe("phase-display", () => {
  it("PHASE_SEGMENT_INDEX is 4 (rightmost unused status-bar segment)", () => {
    expect(PHASE_SEGMENT_INDEX).toBe(4);
  });

  it("phaseLabel returns the short label for each phase", () => {
    expect(phaseLabel("idle")).toBe("ready");
    expect(phaseLabel("spec_drafting")).toBe("spec ✎");
    expect(phaseLabel("plan_drafting")).toBe("plan ✎");
    expect(phaseLabel("executing")).toBe("exec");
    expect(phaseLabel("done")).toBe("done");
    expect(phaseLabel("abandoned")).toBe("abandoned");
  });

  it("renderPhaseSegment applies theme color so output is ANSI-styled", () => {
    const out = renderPhaseSegment("executing");
    expect(stripAnsi(out)).toBe("exec");
    expect(out).not.toBe("exec"); // wrapped in ansi codes
  });

  it("refreshPhaseSegment writes to the supplied statusBar at segment 4", () => {
    const calls: Array<{ idx: number; text: string }> = [];
    const renderCalls: number[] = [];
    refreshPhaseSegment(
      {
        statusBar: { updateSegment: (idx, text) => calls.push({ idx, text }) },
        tui: { requestRender: () => renderCalls.push(1) },
      },
      "spec_drafting",
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.idx).toBe(4);
    expect(calls[0]?.text).toBe("spec ✎");
    expect(renderCalls).toHaveLength(1);
  });

  it("refreshPhaseSegment tolerates a target missing statusBar or tui", () => {
    // Should not throw — defensive helper used from contexts where the
    // layout adapter is partial (e.g. /approve's synthesised layout).
    refreshPhaseSegment({}, "idle");
    refreshPhaseSegment({ statusBar: {} }, "idle");
    expect(true).toBe(true);
  });
});
