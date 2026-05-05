/**
 * Checkpoint coordinator for crew runs per spec §3 Decision 2.
 *
 * Bridges three layers:
 *
 *   - Layer 1 (automated artifact gating) lives in the validator and
 *     phase-executor. The coordinator does not see Layer 1 events.
 *   - Layer 2 (visibility gates): after each PhaseSummaryArtifact is
 *     persisted, the runner calls {@link CheckpointCoordinator.waitForPhaseAdvance}.
 *     Default behavior: auto-advance after `auto_advance_timer_ms`
 *     (default 30_000). When `strict_mode` is true, block indefinitely
 *     until a slash command resolves the gate. Returns `"continue" |
 *     "adjust" | "abort"`.
 *   - Layer 3 (manual pause): {@link requestPause}, {@link requestResume},
 *     {@link requestSkip}, {@link requestReorder}, {@link requestAbort}
 *     are slash-command-driven signals the runner consumes between
 *     tasks/phases.
 *
 * Drift halt branch (spec §5.5): when the supervisor produces a halting
 * score, the runner calls {@link waitForReanchor} which always blocks
 * (no auto-advance) and returns `"continue" | "abort" | "edit_goal"`.
 *
 * Two construction shapes:
 *   - {@link CheckpointCoordinator.headless} — auto-advance always (no
 *     human at the loop). Headless `--strict` is accepted but ignored
 *     for `waitForPhaseAdvance`. `waitForReanchor` exits non-zero with
 *     structured reanchor info on stderr (caller's responsibility — the
 *     coordinator just resolves to "abort" and emits a debug event so
 *     the wrapper can write to stderr).
 *   - {@link CheckpointCoordinator.tui} — TUI-driven; honors
 *     `strict_mode`, fires events the TUI binds to render the phase
 *     summary / re-anchor view.
 *
 * The coordinator is a pure event emitter. It does NOT touch the
 * artifact store, the TUI, or the file system — callers do.
 */
import { EventEmitter } from "node:events";

import { debugLog } from "../debug/logger.js";
import type { ReanchorPrompt, ReanchorOption } from "./drift-reanchor.js";
import type { CrewPhase } from "./types.js";

export const DEFAULT_AUTO_ADVANCE_MS = 30_000;

export type UserAction = "continue" | "adjust" | "abort";

export interface WaitForPhaseAdvanceArgs {
  phase: CrewPhase;
  summary_artifact_id: string;
  signal?: AbortSignal;
}

export interface WaitForReanchorArgs {
  reanchor: ReanchorPrompt;
  signal?: AbortSignal;
}

export interface WaitForReanchorResult {
  option: ReanchorOption;
  /** Set when option === "edit_goal". The new goal text from the user. */
  new_goal?: string;
}

export interface ReorderRequest {
  phase_id: string;
  new_task_order: string[];
}

export type CheckpointMode = "tui" | "headless";

export interface CheckpointCoordinatorOptions {
  mode: CheckpointMode;
  /** TUI mode only — when true, no auto-advance on phase gates. */
  strict_mode?: boolean;
  /** Default 30_000. Ignored in headless mode (always auto-advances). */
  auto_advance_timer_ms?: number;
}

interface PendingPhaseGate {
  phase_id: string;
  resolve: (action: UserAction) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout | null;
}

interface PendingReanchor {
  resolve: (result: WaitForReanchorResult) => void;
  reject: (err: Error) => void;
}

export class CheckpointCoordinator extends EventEmitter {
  readonly mode: CheckpointMode;
  private strictMode: boolean;
  private autoAdvanceMs: number;

  private paused = false;
  private resumeResolvers: Array<() => void> = [];
  private abortRequested = false;
  private skippedTaskIds = new Set<string>();
  private pendingReorders = new Map<string, string[]>();

  private pendingGate: PendingPhaseGate | null = null;
  private pendingReanchor: PendingReanchor | null = null;

  constructor(opts: CheckpointCoordinatorOptions) {
    super();
    this.mode = opts.mode;
    this.strictMode = opts.strict_mode === true;
    this.autoAdvanceMs = opts.auto_advance_timer_ms ?? DEFAULT_AUTO_ADVANCE_MS;
  }

  /** TUI-mode coordinator. Honors strict_mode + auto_advance_timer_ms. */
  static tui(opts?: Omit<CheckpointCoordinatorOptions, "mode">): CheckpointCoordinator {
    return new CheckpointCoordinator({ mode: "tui", ...opts });
  }

  /** Headless coordinator: phase gates always auto-advance, regardless of strict_mode. */
  static headless(opts?: Omit<CheckpointCoordinatorOptions, "mode">): CheckpointCoordinator {
    return new CheckpointCoordinator({ mode: "headless", ...opts });
  }

  // ── Layer 2 phase advance ──────────────────────────────────────────

  async waitForPhaseAdvance(args: WaitForPhaseAdvanceArgs): Promise<UserAction> {
    if (this.abortRequested) {
      this.emit("checkpoint:user_aborted", {
        phase_id: args.phase.id,
        source: "abort_already_requested",
      });
      return "abort";
    }

    // Headless mode: auto-advance immediately, ignoring strict_mode.
    if (this.mode === "headless") {
      this.emit("checkpoint:auto_advance", {
        phase_id: args.phase.id,
        summary_artifact_id: args.summary_artifact_id,
        reason: "headless_no_user",
      });
      debugLog("info", "crew", "checkpoint:auto_advance", {
        data: { phase_id: args.phase.id, mode: "headless" },
      });
      return "continue";
    }

    this.emit("checkpoint:phase_pause", {
      phase_id: args.phase.id,
      summary_artifact_id: args.summary_artifact_id,
      strict_mode: this.strictMode,
      auto_advance_ms: this.strictMode ? null : this.autoAdvanceMs,
    });
    debugLog("info", "crew", "checkpoint:phase_pause", {
      data: {
        phase_id: args.phase.id,
        strict_mode: this.strictMode,
      },
    });

    return await new Promise<UserAction>((resolve, reject) => {
      const onAbort = (): void => {
        if (this.pendingGate?.timer) clearTimeout(this.pendingGate.timer);
        this.pendingGate = null;
        reject(new Error("aborted"));
      };
      args.signal?.addEventListener("abort", onAbort, { once: true });

      let timer: NodeJS.Timeout | null = null;
      if (!this.strictMode) {
        timer = setTimeout(() => {
          this.pendingGate = null;
          this.emit("checkpoint:auto_advance", {
            phase_id: args.phase.id,
            summary_artifact_id: args.summary_artifact_id,
            reason: "timer_expired",
          });
          debugLog("info", "crew", "checkpoint:auto_advance", {
            data: {
              phase_id: args.phase.id,
              timer_ms: this.autoAdvanceMs,
            },
          });
          resolve("continue");
        }, this.autoAdvanceMs);
        if (typeof timer.unref === "function") timer.unref();
      }

      this.pendingGate = {
        phase_id: args.phase.id,
        timer,
        resolve: (action) => {
          if (timer) clearTimeout(timer);
          this.pendingGate = null;
          this.emit("checkpoint:phase_resumed", {
            phase_id: args.phase.id,
            action,
          });
          debugLog("info", "crew", "checkpoint:phase_resumed", {
            data: { phase_id: args.phase.id, action },
          });
          resolve(action);
        },
        reject: (err) => {
          if (timer) clearTimeout(timer);
          this.pendingGate = null;
          reject(err);
        },
      };
    });
  }

  /** Resolve the active phase gate with the given action. Called by slash commands. */
  resolvePhaseAdvance(action: UserAction): boolean {
    if (!this.pendingGate) return false;
    this.pendingGate.resolve(action);
    return true;
  }

  // ── Drift halt re-anchor ───────────────────────────────────────────

  async waitForReanchor(args: WaitForReanchorArgs): Promise<WaitForReanchorResult> {
    if (this.mode === "headless") {
      this.emit("checkpoint:headless_reanchor", { reanchor: args.reanchor });
      debugLog("warn", "crew", "checkpoint:headless_reanchor", {
        data: { options: args.reanchor.options },
      });
      return { option: "abort" };
    }

    this.emit("checkpoint:reanchor_open", { reanchor: args.reanchor });
    debugLog("info", "crew", "checkpoint:reanchor_open", {
      data: { options: args.reanchor.options },
    });

    return await new Promise<WaitForReanchorResult>((resolve, reject) => {
      const onAbort = (): void => {
        this.pendingReanchor = null;
        reject(new Error("aborted"));
      };
      args.signal?.addEventListener("abort", onAbort, { once: true });

      this.pendingReanchor = {
        resolve: (result) => {
          this.pendingReanchor = null;
          this.emit("checkpoint:reanchor_resolved", {
            option: result.option,
            new_goal: result.new_goal,
          });
          debugLog("info", "crew", "checkpoint:reanchor_resolved", {
            data: { option: result.option },
          });
          resolve(result);
        },
        reject,
      };
    });
  }

  /** Resolve the active re-anchor wait. Called by slash commands / TUI view. */
  resolveReanchor(result: WaitForReanchorResult): boolean {
    if (!this.pendingReanchor) return false;
    if (result.option === "edit_goal" && (!result.new_goal || result.new_goal.trim().length === 0)) {
      this.emit("checkpoint:reanchor_rejected", { reason: "empty new goal" });
      return false;
    }
    this.pendingReanchor.resolve(result);
    return true;
  }

  // ── Layer 3 signals ────────────────────────────────────────────────

  requestPause(): void {
    if (this.paused) {
      this.emit("checkpoint:noop", { reason: "already paused" });
      return;
    }
    this.paused = true;
    this.emit("checkpoint:user_paused", {});
    debugLog("info", "crew", "checkpoint:user_paused", { data: {} });
  }

  requestResume(): void {
    // Resume order: pending phase gate first, then pending reanchor (continue), then pause flag.
    if (this.pendingGate) {
      this.resolvePhaseAdvance("continue");
      return;
    }
    if (this.pendingReanchor) {
      this.resolveReanchor({ option: "continue" });
      return;
    }
    if (!this.paused) {
      this.emit("checkpoint:noop", { reason: "nothing to resume" });
      return;
    }
    this.paused = false;
    const resolvers = this.resumeResolvers;
    this.resumeResolvers = [];
    for (const r of resolvers) r();
    this.emit("checkpoint:user_resumed", {});
    debugLog("info", "crew", "checkpoint:user_resumed", { data: {} });
  }

  requestSkip(task_id: string): void {
    if (!task_id || task_id.trim().length === 0) {
      this.emit("checkpoint:skip_rejected", { reason: "empty task id" });
      return;
    }
    this.skippedTaskIds.add(task_id);
    this.emit("checkpoint:user_skipped", { task_id });
    debugLog("info", "crew", "checkpoint:user_skipped", { data: { task_id } });
  }

  requestReorder(phase_id: string, new_task_order: string[]): void {
    if (new_task_order.length === 0) {
      this.emit("checkpoint:reorder_rejected", {
        phase_id,
        reason: "empty list",
      });
      return;
    }
    const seen = new Set<string>();
    for (const id of new_task_order) {
      if (seen.has(id)) {
        this.emit("checkpoint:reorder_rejected", {
          phase_id,
          reason: `duplicate task id: ${id}`,
        });
        return;
      }
      seen.add(id);
    }
    this.pendingReorders.set(phase_id, [...new_task_order]);
    this.emit("checkpoint:user_reordered", {
      phase_id,
      new_task_order: [...new_task_order],
    });
    debugLog("info", "crew", "checkpoint:user_reordered", {
      data: { phase_id, new_task_order },
    });
  }

  requestAbort(): void {
    this.abortRequested = true;
    if (this.pendingGate) {
      this.resolvePhaseAdvance("abort");
    }
    if (this.pendingReanchor) {
      this.resolveReanchor({ option: "abort" });
    }
    if (this.paused) {
      this.paused = false;
      const resolvers = this.resumeResolvers;
      this.resumeResolvers = [];
      for (const r of resolvers) r();
    }
    this.emit("checkpoint:user_aborted", { source: "user_request" });
    debugLog("info", "crew", "checkpoint:user_aborted", { data: {} });
  }

  // ── Runner-facing read surface ─────────────────────────────────────

  isPaused(): boolean {
    return this.paused;
  }

  isAbortRequested(): boolean {
    return this.abortRequested;
  }

  /** True when the task should be force-completed without an LLM call. */
  isTaskSkipped(task_id: string): boolean {
    return this.skippedTaskIds.has(task_id);
  }

  /** Returns and consumes the pending reorder for a phase. */
  consumePendingReorder(phase_id: string): string[] | null {
    const out = this.pendingReorders.get(phase_id);
    if (!out) return null;
    this.pendingReorders.delete(phase_id);
    return [...out];
  }

  /** Block until requestResume() is called. No-op when not paused. */
  async waitWhilePaused(args?: { signal?: AbortSignal }): Promise<void> {
    if (!this.paused) return;
    await new Promise<void>((resolve, reject) => {
      const onAbort = (): void => {
        this.resumeResolvers = this.resumeResolvers.filter((r) => r !== resolve);
        reject(new Error("aborted"));
      };
      args?.signal?.addEventListener("abort", onAbort, { once: true });
      this.resumeResolvers.push(resolve);
    });
  }

  // ── Misc ───────────────────────────────────────────────────────────

  setStrictMode(strict: boolean): void {
    this.strictMode = strict;
  }

  isStrictMode(): boolean {
    return this.strictMode;
  }

  getStatus(): {
    mode: CheckpointMode;
    strict_mode: boolean;
    auto_advance_timer_ms: number;
    paused: boolean;
    abort_requested: boolean;
    awaiting_phase_gate: boolean;
    awaiting_reanchor: boolean;
    skipped_task_count: number;
    pending_reorder_phase_count: number;
  } {
    return {
      mode: this.mode,
      strict_mode: this.strictMode,
      auto_advance_timer_ms: this.autoAdvanceMs,
      paused: this.paused,
      abort_requested: this.abortRequested,
      awaiting_phase_gate: this.pendingGate !== null,
      awaiting_reanchor: this.pendingReanchor !== null,
      skipped_task_count: this.skippedTaskIds.size,
      pending_reorder_phase_count: this.pendingReorders.size,
    };
  }

  /** Test seam — clear all sticky state. Does NOT release waiters. */
  reset(): void {
    this.paused = false;
    this.abortRequested = false;
    this.skippedTaskIds.clear();
    this.pendingReorders.clear();
  }
}

/**
 * Validate a proposed task reorder against the phase's dependency graph.
 * Returns null if valid; otherwise an error message naming the offense.
 *
 * Rules:
 *   - new order must be a permutation of the phase's task ids
 *   - reordering must not put a task before any of its `depends_on`
 */
export function validateReorder(
  phase: CrewPhase,
  new_task_order: string[],
): string | null {
  const existingIds = new Set(phase.tasks.map((t) => t.id));
  if (new_task_order.length !== phase.tasks.length) {
    return `length mismatch: phase has ${phase.tasks.length} tasks, got ${new_task_order.length}`;
  }
  const seen = new Set<string>();
  for (const id of new_task_order) {
    if (!existingIds.has(id)) return `unknown task id: ${id}`;
    if (seen.has(id)) return `duplicate task id: ${id}`;
    seen.add(id);
  }
  // Cycle / dep-order check: for each task in the proposed order, every
  // in-phase dep must appear earlier.
  const positions = new Map(new_task_order.map((id, idx) => [id, idx]));
  const taskById = new Map(phase.tasks.map((t) => [t.id, t]));
  for (const [id, idx] of positions) {
    const task = taskById.get(id);
    if (!task) continue;
    for (const dep of task.depends_on) {
      if (!existingIds.has(dep)) continue; // cross-phase dep, ignore
      const depIdx = positions.get(dep);
      if (depIdx === undefined) return `dep ${dep} of ${id} not in reorder list`;
      if (depIdx >= idx) {
        return `cycle / out-of-order: ${id} depends on ${dep} but appears earlier or at same position`;
      }
    }
  }
  return null;
}
