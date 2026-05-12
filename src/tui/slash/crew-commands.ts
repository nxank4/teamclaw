/**
 * Crew slash commands per spec §3 Decision 2 (checkpoints) +
 * §4 Decision 4 (TUI surface).
 *
 * These commands signal the active CheckpointCoordinator (resolved via
 * src/crew/checkpoint-registry.ts) without holding direct references to
 * the runner. When no crew is active, each command prints a friendly
 * "no active crew" message rather than throwing.
 *
 * Commands shipped here:
 *   - /pause       — Layer 3 manual pause
 *   - /continue    — resolve a pending gate / re-anchor / paused state
 *   - /skip [id]   — force-complete a task; with no id, picks the first
 *                    in-progress task off the active phase
 *   - /reorder     — reorder the next phase's tasks (args: comma- or
 *                    space-separated task ids)
 *   - /abort       — graceful abort (gate or phase loop)
 *   - /adjust      — only valid during the visibility gate; resolves to
 *                    "adjust" so the runner can replan
 *   - /crew        — read-only status snapshot of active crew
 *
 * Out of scope (deferred to follow-up): /crew switch <name>,
 * /crew add/remove/save (manifest mutation).
 */
import type { SlashCommand, CommandContext } from "./registry.js";
import { ICONS } from "../constants/icons.js";
import { defaultTheme } from "../themes/default.js";
import { renderPanel, panelSection } from "../components/panel.js";
import { labelValue } from "../primitives/columns.js";
import { debugLog } from "../../debug/logger.js";
import {
  getActiveCheckpointCoordinator,
  getActiveCrew,
} from "../../crew/checkpoint-registry.js";

function noActiveCrewMessage(ctx: CommandContext, command: string): void {
  ctx.addMessage(
    "system",
    `${defaultTheme.muted(ICONS.warning)} No active crew. /${command} only takes effect during a crew run.`,
  );
}

function emitDebug(command: string, args: string, action: string): void {
  debugLog("info", "crew", `slash:${command}`, {
    data: { input: args, action },
  });
}

export function createPauseCommand(): SlashCommand {
  return {
    name: "pause",
    description: "Pause crew execution between tasks (Layer 3 manual pause)",
    async execute(args, ctx) {
      const coord = getActiveCheckpointCoordinator();
      if (!coord) return noActiveCrewMessage(ctx, "pause");
      coord.requestPause();
      emitDebug("pause", args, "request_pause");
      ctx.addMessage(
        "system",
        `${defaultTheme.warning(ICONS.hourglass)} Pause requested — crew will park between tasks. /continue to resume.`,
      );
    },
  };
}

export function createContinueCommand(): SlashCommand {
  return {
    name: "continue",
    aliases: ["c"],
    description: "Resume from pause / advance phase gate / continue past drift halt",
    async execute(args, ctx) {
      const coord = getActiveCheckpointCoordinator();
      if (!coord) return noActiveCrewMessage(ctx, "continue");
      coord.requestResume();
      emitDebug("continue", args, "request_resume");
      ctx.addMessage(
        "system",
        `${defaultTheme.success(ICONS.success)} continue signaled.`,
      );
    },
  };
}

function pickInProgressTaskId(): string | null {
  const active = getActiveCrew();
  if (!active?.phases) return null;
  for (const p of active.phases) {
    for (const t of p.tasks) {
      if (t.status === "in_progress") return t.id;
    }
  }
  // Fall back to the first pending task on the current phase.
  const phaseIdx = active.current_phase_index ?? 0;
  const phase = active.phases[phaseIdx];
  if (!phase) return null;
  const pending = phase.tasks.find((t) => t.status === "pending");
  return pending?.id ?? null;
}

export function createSkipCommand(): SlashCommand {
  return {
    name: "skip",
    description: "Force-complete a task without an LLM call",
    args: "[task_id]",
    async execute(args, ctx) {
      const coord = getActiveCheckpointCoordinator();
      if (!coord) return noActiveCrewMessage(ctx, "skip");

      let taskId = args.trim();
      if (taskId.length === 0) {
        const picked = pickInProgressTaskId();
        if (!picked) {
          ctx.addMessage(
            "error",
            "No in-progress or pending task to skip. Pass a task id explicitly: /skip <task_id>",
          );
          return;
        }
        taskId = picked;
      }

      coord.requestSkip(taskId);
      emitDebug("skip", args, `request_skip:${taskId}`);
      ctx.addMessage(
        "system",
        `${defaultTheme.warning(ICONS.aborted)} Skip queued for task ${defaultTheme.bold(taskId)}.`,
      );
    },
  };
}

function parseTaskIdList(raw: string): string[] {
  return raw
    .split(/[,\s]+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function nextPendingPhase(): { phase_id: string; tasks: { id: string }[] } | null {
  const active = getActiveCrew();
  if (!active?.phases) return null;
  const idx = active.current_phase_index ?? -1;
  // Next phase = first phase after the current index whose tasks are not all done.
  for (let i = idx + 1; i < active.phases.length; i++) {
    const p = active.phases[i]!;
    if (p.tasks.some((t) => t.status === "pending" || t.status === "in_progress")) {
      return { phase_id: p.id, tasks: p.tasks.map((t) => ({ id: t.id })) };
    }
  }
  // Otherwise reorder the current phase if it still has pending work.
  if (idx >= 0 && idx < active.phases.length) {
    const p = active.phases[idx]!;
    if (p.tasks.some((t) => t.status === "pending")) {
      return { phase_id: p.id, tasks: p.tasks.map((t) => ({ id: t.id })) };
    }
  }
  return null;
}

export function createReorderCommand(): SlashCommand {
  return {
    name: "reorder",
    description: "Reorder the next phase's tasks (comma- or space-separated ids)",
    args: "<task_id_1> <task_id_2> ...",
    async execute(args, ctx) {
      const coord = getActiveCheckpointCoordinator();
      if (!coord) return noActiveCrewMessage(ctx, "reorder");
      const ids = parseTaskIdList(args);
      if (ids.length === 0) {
        ctx.addMessage(
          "error",
          "Usage: /reorder <task_id_1> <task_id_2> ... (comma- or space-separated)",
        );
        return;
      }
      const next = nextPendingPhase();
      if (!next) {
        ctx.addMessage("error", "No pending phase to reorder.");
        return;
      }
      // Reject ids not in the target phase before forwarding to the coordinator.
      const validIds = new Set(next.tasks.map((t) => t.id));
      const unknown = ids.filter((id) => !validIds.has(id));
      if (unknown.length > 0) {
        ctx.addMessage(
          "error",
          `Unknown task ids for phase ${next.phase_id}: ${unknown.join(", ")}`,
        );
        return;
      }
      coord.requestReorder(next.phase_id, ids);
      emitDebug("reorder", args, `request_reorder:${next.phase_id}:${ids.join(",")}`);
      ctx.addMessage(
        "system",
        `${defaultTheme.info(ICONS.arrow)} Reorder queued for phase ${defaultTheme.bold(next.phase_id)}: ${ids.join(" → ")}`,
      );
    },
  };
}

export function createAbortCommand(): SlashCommand {
  return {
    name: "abort",
    description: "Abort the crew run gracefully (saves committed work)",
    async execute(args, ctx) {
      const coord = getActiveCheckpointCoordinator();
      if (!coord) return noActiveCrewMessage(ctx, "abort");
      coord.requestAbort();
      emitDebug("abort", args, "request_abort");
      ctx.addMessage(
        "system",
        `${defaultTheme.error(ICONS.aborted)} Abort signaled. Crew will exit at next safe point.`,
      );
    },
  };
}

export function createAdjustCommand(): SlashCommand {
  return {
    name: "adjust",
    description: "Adjust the plan at a phase gate (replan-driven)",
    async execute(args, ctx) {
      const coord = getActiveCheckpointCoordinator();
      if (!coord) return noActiveCrewMessage(ctx, "adjust");
      const ok = coord.resolvePhaseAdvance("adjust");
      emitDebug("adjust", args, ok ? "resolve_adjust" : "no_pending_gate");
      if (!ok) {
        ctx.addMessage(
          "system",
          `${defaultTheme.muted(ICONS.warning)} /adjust is only valid at a phase visibility gate.`,
        );
        return;
      }
      ctx.addMessage(
        "system",
        `${defaultTheme.info(ICONS.arrow)} adjust requested — runner will replan.`,
      );
    },
  };
}

export function createCrewStatusCommand(): SlashCommand {
  return {
    name: "crew",
    description: "Show current crew composition + run status (read-only)",
    args: "",
    async execute(args, ctx) {
      const active = getActiveCrew();
      if (!active) {
        ctx.addMessage(
          "system",
          `${defaultTheme.muted(ICONS.warning)} No active crew. Start one with --mode crew.`,
        );
        return;
      }
      emitDebug("crew", args, "status_read");
      const m = active.manifest;
      const lines: string[] = [];
      lines.push(...panelSection("Crew composition"));
      lines.push(labelValue("name", m.name, { labelWidth: 14 }));
      lines.push(labelValue("description", m.description, { labelWidth: 14 }));
      lines.push(labelValue("version", m.version, { labelWidth: 14 }));
      lines.push(labelValue("agents", String(m.agents.length), { labelWidth: 14 }));
      lines.push("");
      lines.push(...panelSection("Agents"));
      for (const a of m.agents) {
        const tools = a.tools.join(", ");
        lines.push(labelValue(a.id, `${a.name} — ${tools}`, { labelWidth: 14 }));
      }
      lines.push("");
      lines.push(...panelSection("Run status"));
      lines.push(labelValue("session", active.session_id, { labelWidth: 14 }));
      lines.push(labelValue("goal", active.goal, { labelWidth: 14 }));
      const idx = active.current_phase_index;
      const phaseCount = active.phases?.length ?? 0;
      const phaseLine =
        typeof idx === "number" && active.phases?.[idx]
          ? `${idx + 1}/${phaseCount} — ${active.phases[idx]!.name} (${active.phases[idx]!.id})`
          : phaseCount > 0
            ? `not started (0/${phaseCount})`
            : "no phases";
      lines.push(labelValue("phase", phaseLine, { labelWidth: 14 }));
      const status = active.coordinator.getStatus();
      lines.push(
        labelValue(
          "state",
          status.paused
            ? "paused"
            : status.abort_requested
              ? "abort pending"
              : status.awaiting_phase_gate
                ? "phase gate (visibility)"
                : status.awaiting_reanchor
                  ? "drift re-anchor"
                  : "running",
          { labelWidth: 14 },
        ),
      );
      const panel = renderPanel(
        { title: "Crew status", footer: "/pause /continue /skip /reorder /abort /adjust" },
        lines,
      );
      ctx.addMessage("system", panel.join("\n"));
    },
  };
}

/** Register all crew slash commands into a registry. */
export function registerCrewCommands(registry: {
  register: (cmd: SlashCommand) => void;
}): void {
  registry.register(createPauseCommand());
  registry.register(createContinueCommand());
  registry.register(createSkipCommand());
  registry.register(createReorderCommand());
  registry.register(createAbortCommand());
  registry.register(createAdjustCommand());
  registry.register(createCrewStatusCommand());
}
