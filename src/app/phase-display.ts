/**
 * Status-bar phase indicator helpers.
 *
 * Phase → short label + theme-token color the status bar segment can
 * render directly. The label intentionally short (≤ 14 chars) so it
 * fits in the narrow rightmost segment.
 */

import { defaultTheme } from "../tui/themes/default.js";
import type { Phase } from "../session/phase-machine.js";

export interface PhaseDisplay {
  label: string;
  color: (text: string) => string;
}

const T = defaultTheme;

const DISPLAY: Record<Phase, PhaseDisplay> = {
  idle: { label: "ready", color: T.dim },
  spec_required: { label: "spec ?", color: T.warning },
  spec_drafting: { label: "spec ✎", color: T.accent },
  spec_approved: { label: "spec ✓ / plan ✎", color: T.accent },
  plan_drafting: { label: "plan ✎", color: T.accent },
  plan_approved: { label: "plan ✓ / exec", color: T.accent },
  executing: { label: "exec", color: T.success },
  done: { label: "done", color: T.dim },
  abandoned: { label: "abandoned", color: T.dim },
};

export function renderPhaseSegment(phase: Phase): string {
  const entry = DISPLAY[phase];
  return entry.color(entry.label);
}

export function phaseLabel(phase: Phase): string {
  return DISPLAY[phase].label;
}

/**
 * Status-bar segment index reserved for the phase indicator.
 * Segments 0–3 are: provider, connection, (unused), token/agent status.
 * Segment 4 was confirmed unused by the prior exploration; using it
 * keeps the existing layouts untouched.
 */
export const PHASE_SEGMENT_INDEX = 4;

/**
 * Update the status-bar phase segment to reflect the session's current
 * phase. Designed to be called at the entry + exit of handleWithRouter
 * and after each setPhase in slash command handlers — the implementation
 * is idempotent (writing the same segment value twice is a no-op for
 * the renderer).
 */
export interface PhaseSegmentTarget {
  statusBar?: { updateSegment?: (idx: number, text: string, color?: ((s: string) => string) | null) => void };
  tui?: { requestRender?: () => void };
}

export function refreshPhaseSegment(layout: PhaseSegmentTarget, phase: Phase): void {
  const entry = DISPLAY[phase];
  layout.statusBar?.updateSegment?.(PHASE_SEGMENT_INDEX, entry.label, entry.color);
  layout.tui?.requestRender?.();
}
