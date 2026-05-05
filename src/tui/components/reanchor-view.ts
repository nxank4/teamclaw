/**
 * Re-anchor view — renders the drift-halt re-anchor prompt and an
 * interactive option list per spec §5.5 + §3 Decision 2.
 *
 * Two modes:
 *   - "options" (default): prints the markdown + the three options
 *     [continue / abort / edit_goal] as a footer.
 *   - "edit_goal": replaces the option footer with an inline editor
 *     prefilled with `current_goal`. Commit submits a new goal back to
 *     the host.
 *
 * The renderer is pure — host TUI handles keypress dispatch and
 * editor cursor state (we just render the buffer).
 */
import { renderMarkdown } from "./markdown.js";
import { renderPanel } from "./panel.js";
import { defaultTheme } from "../themes/default.js";
import type { ReanchorPrompt, ReanchorOption } from "../../crew/drift-reanchor.js";

export type ReanchorViewMode = "options" | "edit_goal";

export interface ReanchorViewProps {
  reanchor: ReanchorPrompt;
  /** Verbatim original goal — pre-fills the editor when mode flips to edit_goal. */
  current_goal: string;
  mode?: ReanchorViewMode;
  /** When mode === "edit_goal", the current editor buffer. */
  editor_buffer?: string;
  width?: number;
}

function renderOptionsFooter(options: readonly ReanchorOption[]): string {
  const c = defaultTheme.primary;
  const a = defaultTheme.error;
  const e = defaultTheme.warning;
  const labels: Record<ReanchorOption, string> = {
    continue: `${c("[c]")} continue`,
    abort: `${a("[a]")} abort`,
    edit_goal: `${e("[e]")} edit goal`,
  };
  return options.map((o) => labels[o]).join("   ");
}

export function renderReanchor(props: ReanchorViewProps): string[] {
  const width = props.width ?? 80;
  const contentWidth = Math.max(40, width - 6);
  const mode: ReanchorViewMode = props.mode ?? "options";

  const content: string[] = [];
  content.push(...renderMarkdown(props.reanchor.markdown, contentWidth));

  if (mode === "edit_goal") {
    content.push("");
    content.push(defaultTheme.dim("── edit goal — Enter to submit, Esc to cancel ──"));
    content.push("");
    const buffer = props.editor_buffer ?? props.current_goal;
    // Render the buffer as plain text so the host can overlay a cursor.
    if (buffer.length === 0) {
      content.push(defaultTheme.dim("(empty — type a new goal)"));
    } else {
      for (const line of buffer.split("\n")) {
        content.push(defaultTheme.bold(line));
      }
    }
  }

  const footer =
    mode === "edit_goal"
      ? `${defaultTheme.primary("Enter")} submit   ${defaultTheme.error("Esc")} cancel`
      : renderOptionsFooter(props.reanchor.options);

  return renderPanel(
    {
      title: mode === "edit_goal" ? "Re-anchor — edit goal" : "Re-anchor required",
      footer,
      width: "auto",
      maxWidth: width,
      termWidth: width,
      borderColor: (s) => defaultTheme.warning(s),
      titleColor: (s) => defaultTheme.warning(defaultTheme.bold(s)),
    },
    content,
  );
}

export class ReanchorView {
  readonly id: string;
  private props: ReanchorViewProps;

  constructor(id: string, props: ReanchorViewProps) {
    this.id = id;
    this.props = { mode: "options", ...props };
  }

  render(width: number): string[] {
    return renderReanchor({ ...this.props, width });
  }

  setMode(mode: ReanchorViewMode): void {
    this.props = {
      ...this.props,
      mode,
      editor_buffer:
        mode === "edit_goal"
          ? this.props.editor_buffer ?? this.props.current_goal
          : undefined,
    };
  }

  setEditorBuffer(buffer: string): void {
    this.props = { ...this.props, editor_buffer: buffer };
  }

  getEditorBuffer(): string {
    return this.props.editor_buffer ?? this.props.current_goal;
  }

  getMode(): ReanchorViewMode {
    return this.props.mode ?? "options";
  }
}
