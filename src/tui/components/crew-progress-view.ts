/**
 * Sticky overlay that renders the live crew run as a one-line-per-agent
 * tree above the divider. Stateless renderer: the host (router-wiring
 * for the TUI, run-crew-headless for stdout) owns the CrewRunState and
 * pushes it in via setProps. Spinner advancement is also host-driven —
 * the component just receives a frame index so all animations beat on
 * the same SPINNER_INTERVAL_MS cadence as the rest of the TUI.
 *
 * Layout matches the screenshot:
 *
 *   ├─ ✓ Planner · 7 tasks
 *   ├─ ▘ Coder · running
 *   ├─ ○ Reviewer · queued
 *   └─ ○ Tester · queued
 *      tokens 12.4k
 */
import { ICONS } from "../constants/icons.js";
import { defaultTheme } from "../themes/default.js";
import { agentDisplayName, getAgentColorFn } from "../../app/agent-display.js";
import { formatTokens } from "../../utils/formatters.js";
import type { AgentRunEntry, AgentRunStatus, CrewRunState } from "../../app/crew-run-state.js";

export interface CrewProgressViewProps {
  state: CrewRunState;
  spinnerFrame: number;
  width?: number;
}

function statusGlyph(entry: AgentRunEntry, spinnerFrame: number): string {
  const status: AgentRunStatus = entry.status;
  switch (status) {
    case "done":
      return defaultTheme.success(ICONS.success);
    case "running": {
      const frames = ICONS.boxFrames;
      const glyph = frames[spinnerFrame % frames.length]!;
      return getAgentColorFn(entry.agentId)(glyph);
    }
    case "blocked":
      return defaultTheme.error(ICONS.blocked);
    case "skipped":
      return defaultTheme.dim("—");
    case "queued":
    default:
      return defaultTheme.dim(ICONS.dotEmpty);
  }
}

function metricStyle(entry: AgentRunEntry): string {
  if (entry.status === "blocked") return defaultTheme.error(entry.metric);
  if (entry.status === "done") return defaultTheme.dim(entry.metric);
  if (entry.status === "running") return defaultTheme.info(entry.metric);
  return defaultTheme.dim(entry.metric);
}

export function renderCrewProgress(props: CrewProgressViewProps): string[] {
  const entries = [...props.state.agents.values()];
  if (entries.length === 0) {
    // Render nothing visible — host can still keep the slot allocated.
    return [];
  }

  const lines: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const isLast = i === entries.length - 1;
    const branch = defaultTheme.dim(isLast ? "└─" : "├─");
    const glyph = statusGlyph(entry, props.spinnerFrame);
    const name = getAgentColorFn(entry.agentId)(agentDisplayName(entry.agentId));
    const metric = metricStyle(entry);
    lines.push(`${branch} ${glyph} ${name} ${defaultTheme.dim("·")} ${metric}`);
  }

  const inputCell = defaultTheme.info(`↑ ${formatTokens(props.state.totalInputTokens)}`);
  const outputCell = defaultTheme.warning(`↓ ${formatTokens(props.state.totalOutputTokens)}`);
  lines.push(`   ${inputCell}  ${outputCell}`);

  return lines;
}

export class CrewProgressView {
  readonly id: string;
  hidden = true;
  private props: CrewProgressViewProps;

  constructor(id: string, props: CrewProgressViewProps) {
    this.id = id;
    this.props = props;
  }

  render(width: number): string[] {
    return renderCrewProgress({ ...this.props, width });
  }

  setProps(patch: Partial<CrewProgressViewProps>): void {
    this.props = { ...this.props, ...patch };
  }

  getProps(): CrewProgressViewProps {
    return this.props;
  }
}
