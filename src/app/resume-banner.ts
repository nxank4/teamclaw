import { ctp } from "../tui/themes/default.js";
import { isTerminal } from "../session/phase-machine.js";
import { formatRelativeTime } from "../utils/formatters.js";
import type { Session } from "../session/session.js";

const MAX_TITLE_LENGTH = 40;

export function buildResumeBannerContent(session: Session): string {
  const state = session.getState();
  const title = truncate(state.title, MAX_TITLE_LENGTH);
  const count = session.messageCount;
  const ago = formatRelativeTime(state.updatedAt);
  const lines = [`Resuming session: ${title} · ${count} messages · ${ago}`];

  // Phase hint — surfaces unfinished spec/plan workflows on resume so
  // the user knows which slash command to run to continue. Idle and
  // terminal phases are skipped (no action needed). Some test stubs
  // build sessions without a getPhase method; the optional-chain skips
  // the hint cleanly in that case.
  const phase = session.getPhase?.();
  if (phase && phase.currentPhase !== "idle" && !isTerminal(phase.currentPhase)) {
    const hint = hintForPhase(phase.currentPhase);
    if (hint) lines.push(hint);
  }

  return lines.map((l) => ctp.subtext1(l)).join("\n");
}

function hintForPhase(phase: string): string | null {
  switch (phase) {
    case "spec_required":
    case "spec_drafting":
      return "Session is in spec_drafting — type /spec to continue, or /abandon to give up.";
    case "spec_approved":
    case "plan_drafting":
      return "Session is in plan_drafting — type /plan to continue, or /abandon to give up.";
    case "plan_approved":
    case "executing":
      return "Session is in executing — type your next prompt to keep working under the approved plan.";
    default:
      return null;
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
