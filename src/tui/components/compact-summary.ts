/**
 * Renderer for the OpenPawl-branded /compact summary.
 *
 * Output is a chat-stream message tagged `op:compact`. The shape is a
 * 5-line box-drawing bubble identifying the compaction event, the
 * significant inputs that survived in summary form, and the token math.
 *
 * Two display modes: collapsed (default — verb + target only) and
 * expanded (adds a one-line detail under each event). The keybinding
 * layer toggles modes by walking the message stream for the tagged
 * message and re-rendering with the inverted `expanded` flag.
 */

import type { Theme } from "../themes/theme.js";

export interface CompactEvent {
  /** Action verb shown in primary color. */
  verb: string;
  /** Target string (file path, plan path, etc.) shown in dim color. */
  target: string;
  /** Optional inline annotation, e.g. "(145 lines)". Dim. */
  extra?: string;
  /** Optional second line shown only when expanded. Dim. */
  detail?: string;
}

export interface CompactRecord {
  events: CompactEvent[];
  beforeTokens: number;
  afterTokens: number;
  reductionPercent: number;
}

/** Tag used on the chat-stream message so the keybinding can find it. */
export const COMPACT_MESSAGE_TAG = "op:compact";

/**
 * Build the pre-styled lines for the /compact summary message.
 *
 * Color rules:
 *   - box-drawing chars and action verbs        → theme.primary
 *   - tag label ("op:compact")                   → theme.muted
 *   - file paths, line counts, token math       → theme.dim
 *   - hint text in the header                   → theme.dim
 */
export function renderCompactSummary(
  record: CompactRecord,
  theme: Theme,
  expanded = false,
): string[] {
  const lines: string[] = [];

  const tl = theme.primary("┌");
  const mid = theme.primary("├");
  const vert = theme.primary("│");
  const bl = theme.primary("└");

  lines.push(`${tl} ${theme.muted(COMPACT_MESSAGE_TAG)}`);

  const hint = expanded
    ? theme.dim("(Ctrl+O or Ctrl+E to collapse)")
    : theme.dim("(Ctrl+O or Ctrl+E expand)");
  lines.push(`${mid} ${theme.primary("Compacted")} ${hint}`);

  for (const event of record.events) {
    const extra = event.extra ? ` ${theme.dim(event.extra)}` : "";
    lines.push(
      `${mid} ${theme.primary(event.verb)} ${theme.dim(event.target)}${extra}`,
    );
    if (expanded && event.detail) {
      lines.push(`${vert}  ${theme.dim("•")} ${theme.dim(event.detail)}`);
    }
  }

  const before = record.beforeTokens.toLocaleString();
  const after = record.afterTokens.toLocaleString();
  const reduction = `${record.reductionPercent}% reduction`;
  lines.push(
    `${bl} ${theme.dim(`${before} → ${after} tokens (${reduction})`)}`,
  );

  return lines;
}

/**
 * Extract significant tool-call events from a message history. Walks the
 * tail of the conversation looking for assistant tool calls (Read, Edit,
 * Write, Grep, Glob, Bash, WebFetch, WebSearch) and returns up to
 * `limit` events, newest-last preserved as input order.
 *
 * V1 keeps this lossy on purpose — the renderer's value is the brand
 * cue, not a forensic trace. A future pass can plug in richer detail
 * (line counts, diff stats) once the compaction pipeline surfaces them.
 */
export function extractCompactEvents(
  messages: Array<{ role: string; content: string }>,
  limit = 4,
): CompactEvent[] {
  const events: CompactEvent[] = [];
  // Scan tool messages — their content tends to be the tool's output.
  // We look at assistant + user message bodies for explicit file path
  // mentions inside backticks or `tool:Name` markers. This is the
  // simplest portable extraction; richer scanning belongs in a later
  // iteration that runs alongside the compactor.
  const toolHints = /(?:Read|Edit|Write|Grep|Glob|Bash|WebFetch|WebSearch)\b[^.\n]{0,80}/g;
  const pathHint = /(?:`([^`]+)`|([\w./-]+\.(?:ts|tsx|md|json|yaml|yml|js|jsx)))/;
  const seen = new Set<string>();
  for (let i = messages.length - 1; i >= 0 && events.length < limit; i--) {
    const msg = messages[i];
    if (!msg || !msg.content) continue;
    const matches = msg.content.matchAll(toolHints);
    for (const m of matches) {
      const fragment = m[0];
      const pathMatch = fragment.match(pathHint);
      const target = pathMatch?.[1] ?? pathMatch?.[2];
      if (!target) continue;
      const key = `${fragment.split(/\s+/)[0]}:${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const verb = mapToolNameToVerb(fragment.split(/\s+/)[0] ?? "Read");
      events.unshift({ verb, target });
      if (events.length >= limit) break;
    }
  }
  return events;
}

function mapToolNameToVerb(tool: string): string {
  switch (tool) {
    case "Read":
    case "Grep":
    case "Glob":
    case "WebFetch":
    case "WebSearch":
      return "Read";
    case "Edit":
    case "Write":
      return "Wrote";
    case "Bash":
      return "Ran";
    default:
      return "Referenced";
  }
}
