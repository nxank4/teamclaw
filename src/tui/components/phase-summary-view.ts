/**
 * Phase summary view — renders a PhaseSummaryArtifact as terminal lines
 * for display between phases (Layer 2 visibility gate per spec §3
 * Decision 2).
 *
 * Sections rendered:
 *   - Phase name + complexity tier badge
 *   - Task outcomes table (status icon, description, agent, tokens, wall time)
 *   - Files created / modified
 *   - Per-agent confidence bars (when agent_confidences populated)
 *   - Drift score line (when drift_score provided)
 *   - Meeting notes markdown (when meeting_notes_artifact_id resolved)
 *   - Action footer with auto-advance countdown
 *
 * The renderer is pure: caller passes in already-fetched artifact
 * payloads + optional meeting markdown + countdown state. The host TUI
 * is responsible for keypress wiring and ticking the countdown via a
 * 1-second interval that re-renders.
 */
import { renderMarkdown } from "./markdown.js";
import { renderPanel } from "./panel.js";
import { ICONS } from "../constants/icons.js";
import { defaultTheme } from "../themes/default.js";
import { formatDuration } from "../../utils/formatters.js";
import type { PhaseSummaryArtifactPayload } from "../../crew/artifacts/types.js";
import type { CrewPhase, CrewTask } from "../../crew/types.js";

export interface PhaseSummaryViewProps {
  phase: CrewPhase;
  payload: PhaseSummaryArtifactPayload;
  /** Optional meeting markdown to render below the summary. */
  meeting_markdown?: string;
  /** Optional drift score (0..1) shown as a small indicator. */
  drift_score?: number;
  /** When set, the auto-advance footer shows "advancing in Ns…". */
  auto_advance_remaining_ms?: number;
  /** When true, hides the countdown line (strict mode). */
  strict_mode?: boolean;
  /** Render width hint. Default 80. */
  width?: number;
}

const TIER_LABEL: Record<"1" | "2" | "3", string> = {
  "1": "T1 quick",
  "2": "T2 moderate",
  "3": "T3 complex",
};

function tierBadge(tier: "1" | "2" | "3"): string {
  const label = TIER_LABEL[tier];
  if (tier === "1") return defaultTheme.dim(`[${label}]`);
  if (tier === "2") return defaultTheme.info(`[${label}]`);
  return defaultTheme.warning(`[${label}]`);
}

function statusIcon(status: CrewTask["status"]): string {
  switch (status) {
    case "completed":
      return defaultTheme.success(ICONS.success);
    case "failed":
      return defaultTheme.error(ICONS.error);
    case "blocked":
      return defaultTheme.warning(ICONS.aborted);
    case "incomplete":
      return defaultTheme.warning(ICONS.warning);
    case "in_progress":
      return defaultTheme.info(ICONS.dotHalf);
    case "pending":
      return defaultTheme.dim(ICONS.dotEmpty);
  }
}

function statusColor(status: CrewTask["status"]): (s: string) => string {
  switch (status) {
    case "completed":
      return defaultTheme.success;
    case "failed":
      return defaultTheme.error;
    case "blocked":
    case "incomplete":
      return defaultTheme.warning;
    case "in_progress":
      return defaultTheme.info;
    case "pending":
    default:
      return defaultTheme.dim;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + "…";
}

function renderTaskTable(phase: CrewPhase, contentWidth: number): string[] {
  if (phase.tasks.length === 0) {
    return [defaultTheme.dim("(no tasks)")];
  }
  const lines: string[] = [];
  // Layout: icon(2) id(6) desc(remaining-pad) agent(10) tokens(8) time(8)
  const idW = 6;
  const agentW = 12;
  const tokensW = 9;
  const timeW = 9;
  const reservedW = 2 + 1 + idW + 1 + agentW + 1 + tokensW + 1 + timeW;
  const descW = Math.max(10, contentWidth - reservedW);

  // Header
  const header = [
    "  ",
    defaultTheme.dim("id".padEnd(idW)),
    " ",
    defaultTheme.dim("description".padEnd(descW)),
    " ",
    defaultTheme.dim("agent".padEnd(agentW)),
    " ",
    defaultTheme.dim("tokens".padEnd(tokensW)),
    " ",
    defaultTheme.dim("time".padEnd(timeW)),
  ].join("");
  lines.push(header);

  for (const t of phase.tasks) {
    const icon = statusIcon(t.status);
    const idStr = truncate(t.id, idW).padEnd(idW);
    const descStr = truncate(t.description, descW).padEnd(descW);
    const agentStr = truncate(t.assigned_agent, agentW).padEnd(agentW);
    const totalTokens = t.input_tokens + t.output_tokens;
    const tokensStr = String(totalTokens).padStart(tokensW);
    const timeStr = (t.wall_time_ms > 0 ? formatDuration(t.wall_time_ms) : "—").padStart(timeW);
    const color = statusColor(t.status);
    lines.push(
      `${icon} ${color(idStr)} ${descStr} ${defaultTheme.muted(agentStr)} ${defaultTheme.dim(tokensStr)} ${defaultTheme.dim(timeStr)}`,
    );
  }
  return lines;
}

function renderConfidenceBars(
  agentConfidences: Record<string, number>,
  width: number,
): string[] {
  const entries = Object.entries(agentConfidences);
  if (entries.length === 0) return [];
  const labelW = Math.max(6, ...entries.map(([id]) => id.length));
  // 2 spaces leading + label + space + bar + space + pct(4) — leave 4 chars
  // headroom for the panel's own padding and rounding.
  const barW = Math.max(10, width - labelW - 12);
  const lines: string[] = [defaultTheme.dim("agent confidences")];
  for (const [id, conf] of entries) {
    const filled = Math.round((conf / 100) * barW);
    const bar = ICONS.block.repeat(filled) + ICONS.dotEmpty.repeat(Math.max(0, barW - filled));
    const color =
      conf >= 75 ? defaultTheme.success : conf >= 50 ? defaultTheme.info : defaultTheme.warning;
    lines.push(`  ${id.padEnd(labelW)} ${color(bar)} ${String(conf).padStart(3)}%`);
  }
  return lines;
}

function renderDriftScore(score: number, width: number): string[] {
  const pct = Math.round(score * 100);
  const barW = Math.max(8, Math.min(20, width - 24));
  const filled = Math.round((score) * barW);
  const bar = ICONS.block.repeat(filled) + ICONS.dotEmpty.repeat(Math.max(0, barW - filled));
  const color =
    score >= 0.75 ? defaultTheme.error : score >= 0.5 ? defaultTheme.warning : defaultTheme.success;
  return [`${defaultTheme.dim("drift score")}  ${color(bar)} ${color(String(pct).padStart(3) + "%")}`];
}

function renderFiles(label: string, files: string[]): string[] {
  if (files.length === 0) return [];
  const lines: string[] = [defaultTheme.dim(label)];
  for (const f of files) lines.push(`  ${ICONS.bullet} ${f}`);
  return lines;
}

function renderActionFooter(
  strict: boolean,
  remainingMs: number | undefined,
): string {
  const c = (s: string): string => defaultTheme.primary(s);
  const a = (s: string): string => defaultTheme.warning(s);
  const x = (s: string): string => defaultTheme.error(s);
  const parts = [
    `${c("[c]")} continue`,
    `${a("[a]")} adjust`,
    `${x("[x]")} abort`,
  ];
  let footer = parts.join("   ");
  if (!strict && typeof remainingMs === "number" && remainingMs > 0) {
    const seconds = Math.ceil(remainingMs / 1000);
    footer += defaultTheme.dim(`     advancing in ${seconds}s…`);
  } else if (strict) {
    footer += defaultTheme.dim("     /continue, /adjust, /abort");
  }
  return footer;
}

export function renderPhaseSummary(props: PhaseSummaryViewProps): string[] {
  const width = props.width ?? 80;
  const contentWidth = Math.max(40, width - 6); // borders + padding

  const headerLine = `${defaultTheme.bold(props.phase.name)}  ${tierBadge(props.phase.complexity_tier)}  ${defaultTheme.dim(`(${props.phase.id})`)}`;
  const counts = `${defaultTheme.success(`${props.payload.tasks_completed} done`)}  ` +
    `${defaultTheme.error(`${props.payload.tasks_failed} failed`)}  ` +
    `${defaultTheme.warning(`${props.payload.tasks_blocked} blocked`)}`;

  const content: string[] = [];
  content.push(headerLine);
  content.push(counts);
  content.push("");
  content.push(...renderTaskTable(props.phase, contentWidth));

  const created = renderFiles("files created", props.payload.files_created ?? []);
  const modified = renderFiles("files modified", props.payload.files_modified ?? []);
  if (created.length > 0 || modified.length > 0) {
    content.push("");
    content.push(...created);
    if (created.length > 0 && modified.length > 0) content.push("");
    content.push(...modified);
  }

  const conf = renderConfidenceBars(props.payload.agent_confidences ?? {}, contentWidth);
  if (conf.length > 0) {
    content.push("");
    content.push(...conf);
  }

  if (typeof props.drift_score === "number") {
    content.push("");
    content.push(...renderDriftScore(props.drift_score, contentWidth));
  }

  if (props.meeting_markdown) {
    content.push("");
    content.push(defaultTheme.dim("── meeting notes ──"));
    content.push(...renderMarkdown(props.meeting_markdown, contentWidth));
  }

  return renderPanel(
    {
      title: `Phase complete — ${props.phase.name}`,
      footer: renderActionFooter(!!props.strict_mode, props.auto_advance_remaining_ms),
      width: "auto",
      maxWidth: width,
      termWidth: width,
    },
    content,
  );
}

/**
 * Component-shaped wrapper for hosts that prefer the Component interface.
 * Reactive state (countdown ticks, action callback) lives in the host.
 */
export class PhaseSummaryView {
  readonly id: string;
  private props: PhaseSummaryViewProps;

  constructor(id: string, props: PhaseSummaryViewProps) {
    this.id = id;
    this.props = props;
  }

  render(width: number): string[] {
    return renderPhaseSummary({ ...this.props, width });
  }

  setProps(patch: Partial<PhaseSummaryViewProps>): void {
    this.props = { ...this.props, ...patch };
  }

  getProps(): PhaseSummaryViewProps {
    return this.props;
  }
}
