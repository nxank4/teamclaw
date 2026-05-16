/**
 * /compact slash command — show context usage, run compaction, and
 * surface the result in an OpenPawl-branded chat-stream message tagged
 * `op:compact`.
 *
 * The renderer lives in src/tui/components/compact-summary.ts; this
 * file is the slash-command wrapper that builds the CompactRecord and
 * tracks per-session expand state for the Ctrl+O / Ctrl+E toggle.
 */
import type { SlashCommand } from "../../tui/slash/registry.js";
import type { ContextTracker } from "../../context/context-tracker.js";
import type { CompactableMessage } from "../../context/compaction.js";
import { compact } from "../../context/compaction.js";
import {
  COMPACT_MESSAGE_TAG,
  extractCompactEvents,
  renderCompactSummary,
  type CompactRecord,
} from "../../tui/components/compact-summary.js";
import { defaultTheme } from "../../tui/themes/default.js";

export interface CompactCommandDeps {
  contextTracker: ContextTracker;
  getMessages: () => CompactableMessage[];
  callLLM?: (prompt: string) => Promise<string>;
}

interface SessionCompactState {
  record: CompactRecord;
  expanded: boolean;
}

/**
 * Per-session compact state. Keyed by session id; the slash-command
 * path keys on CURRENT_SESSION_KEY because CommandContext does not
 * carry a session id, while the auto-trigger and keybinding paths key
 * by the real session id from AppContext. The keybinding handler falls
 * back to CURRENT_SESSION_KEY when no session-keyed record is found.
 */
export const CURRENT_SESSION_KEY = "__current__";
const sessionState = new Map<string, SessionCompactState>();

export function setCurrentCompact(sessionId: string, record: CompactRecord): void {
  sessionState.set(sessionId, { record, expanded: false });
}

export function getCurrentCompact(sessionId: string): SessionCompactState | null {
  return sessionState.get(sessionId) ?? null;
}

export function toggleCurrentCompactExpanded(sessionId: string): SessionCompactState | null {
  const current = sessionState.get(sessionId);
  if (!current) return null;
  const next = { record: current.record, expanded: !current.expanded };
  sessionState.set(sessionId, next);
  return next;
}

function buildHealthyRecord(
  beforeTokens: number,
  utilizationPercent: number,
): CompactRecord {
  return {
    events: [
      {
        verb: "Context",
        target: `${utilizationPercent}% utilization`,
        extra: "(no compaction needed; --force to compact anyway)",
      },
    ],
    beforeTokens,
    afterTokens: beforeTokens,
    reductionPercent: 0,
  };
}

/**
 * Pre-dispatch auto-trigger. Called from prompt-handler.handleWithRouter
 * before the user's prompt is forwarded to the router. When context
 * utilization is at or above the threshold and no compaction is currently
 * in-flight for this session, run compaction and surface the branded
 * summary in the chat stream before the prompt response begins streaming.
 *
 * Threshold defaults to 70 (per the v0.4 spec). The "currently in-flight"
 * guard is a module-level Set keyed by a stable session id; without it,
 * a rapid pair of prompts could double-trigger.
 */
const AUTO_THRESHOLD_PERCENT = 70;
const inFlight = new Set<string>();

export interface AutoCompactArgs {
  deps: CompactCommandDeps;
  sessionId: string;
  /** Called with the rendered lines + the message tag so the caller can insert it into the chat stream. */
  emit: (lines: string[], tag: string) => void;
}

export async function autoCompactIfNeeded(args: AutoCompactArgs): Promise<void> {
  if (inFlight.has(args.sessionId)) return;
  const messages = args.deps.getMessages();
  const snapshot = args.deps.contextTracker.snapshot(messages);
  if (snapshot.utilizationPercent < AUTO_THRESHOLD_PERCENT) return;

  inFlight.add(args.sessionId);
  try {
    const beforeTokens = snapshot.estimatedTokens;
    const result = await compact(messages, snapshot.level, {
      callLLM: args.deps.callLLM,
      keepLastExchanges: snapshot.level === "emergency" ? 5 : 10,
      emergencyKeepLast: 5,
    });
    const after = args.deps.contextTracker.snapshot(messages);
    const events = extractCompactEvents(messages);
    events.push({
      verb: "Strategy",
      target: result?.strategy ?? "no-op",
      extra: `(${result?.messagesAffected ?? 0} messages affected)`,
    });
    const reduction = beforeTokens > 0
      ? Math.round(((beforeTokens - after.estimatedTokens) / beforeTokens) * 100)
      : 0;
    const record: CompactRecord = {
      events,
      beforeTokens,
      afterTokens: after.estimatedTokens,
      reductionPercent: reduction,
    };
    setCurrentCompact(args.sessionId, record);
    args.emit(renderCompactSummary(record, defaultTheme, false), COMPACT_MESSAGE_TAG);
  } finally {
    inFlight.delete(args.sessionId);
  }
}

export function createCompactCommand(deps: CompactCommandDeps): SlashCommand {
  return {
    name: "compact",
    aliases: ["ctx"],
    description: "Compact session context and render the op:compact summary",
    args: "[--force]",
    async execute(args: string, ctx) {
      const messages = deps.getMessages();
      const snapshot = deps.contextTracker.snapshot(messages);

      const forceEmergency = args.includes("--force") || args.includes("--full");

      if (!forceEmergency && snapshot.level === "normal") {
        const healthy = buildHealthyRecord(
          snapshot.estimatedTokens,
          snapshot.utilizationPercent,
        );
        const lines = renderCompactSummary(healthy, defaultTheme, false);
        ctx.addMessage("system", lines.join("\n"), { tag: COMPACT_MESSAGE_TAG });
        return;
      }

      const beforeTokens = snapshot.estimatedTokens;
      const level = forceEmergency ? "emergency" as const : snapshot.level;

      const result = await compact(messages, level, {
        callLLM: deps.callLLM,
        keepLastExchanges: level === "emergency" ? 5 : 10,
        emergencyKeepLast: 5,
        force: forceEmergency,
      });

      const afterSnapshot = deps.contextTracker.snapshot(messages);
      const events = extractCompactEvents(messages);
      // Annotate the bottom strategy line so the user can still tell
      // which compaction path ran — important for debug.
      const strategyLabel = result?.strategy ?? "no-op";
      events.push({
        verb: "Strategy",
        target: strategyLabel,
        extra: `(${result?.messagesAffected ?? 0} messages affected)`,
      });

      const reduction = beforeTokens > 0
        ? Math.round(((beforeTokens - afterSnapshot.estimatedTokens) / beforeTokens) * 100)
        : 0;
      const record: CompactRecord = {
        events,
        beforeTokens,
        afterTokens: afterSnapshot.estimatedTokens,
        reductionPercent: reduction,
      };

      // CommandContext does not carry a session id. The TUI is
      // single-session at a time so a fixed key is sufficient; the
      // keybinding handler reads the same key via its own access path.
      setCurrentCompact(CURRENT_SESSION_KEY, record);
      const lines = renderCompactSummary(record, defaultTheme, false);
      ctx.addMessage("system", lines.join("\n"), { tag: COMPACT_MESSAGE_TAG });
    },
  };
}
