/**
 * CrewSession — TUI host for a crew run.
 *
 * Owns:
 *   - the {@link CheckpointCoordinator} (TUI mode)
 *   - the active crew registration (so slash commands can find it)
 *   - the view binding: when the coordinator opens a phase gate / drift
 *     reanchor, render the corresponding view in the message stream
 *   - Escape double-tap behavior: first Escape → /pause, second Escape
 *     within {@link DOUBLE_ESCAPE_WINDOW_MS} → /abort
 *
 * The session does NOT launch crew runs itself — that's the caller's job
 * (currently invoked from the headless entry point; TUI launch lands in
 * a follow-up). It just supplies the coordinator and the wiring.
 *
 * Tests in crew-session.test.ts focus on the coordinator-event → view
 * payload mapping; they pass a stub host that captures rendered lines.
 */
import { CheckpointCoordinator } from "../crew/checkpoints.js";
import {
  clearActiveCrew,
  setActiveCrew,
  updateActiveCrewProgress,
} from "../crew/checkpoint-registry.js";
import type { ReanchorPrompt } from "../crew/drift-reanchor.js";
import type { CrewManifest } from "../crew/manifest/index.js";
import type { CrewPhase } from "../crew/types.js";
import type { PhaseSummaryArtifactPayload } from "../crew/artifacts/types.js";
import {
  PhaseSummaryView,
  type PhaseSummaryViewProps,
} from "../tui/components/phase-summary-view.js";
import { ReanchorView } from "../tui/components/reanchor-view.js";
import { defaultTheme } from "../tui/themes/default.js";
import { ICONS } from "../tui/constants/icons.js";
import { debugLog } from "../debug/logger.js";
import { setActiveCrewEscapeHandler } from "./crew-session-hook.js";

export const DOUBLE_ESCAPE_WINDOW_MS = 2000;

export interface CrewSessionHost {
  /** Render a system-role message into the TUI message stream. */
  addMessage: (role: "system" | "agent" | "error", content: string) => void;
  /** Re-render the TUI immediately. */
  requestRender: () => void;
  /**
   * Optional: present a phase summary view as a live (re-rendering)
   * panel. If absent, the host will render once via addMessage.
   */
  showPhaseSummaryView?: (view: PhaseSummaryView) => void;
  /** Optional: hide / close the active phase summary view. */
  hidePhaseSummaryView?: () => void;
  /** Optional: present the reanchor view as a live, interactive panel. */
  showReanchorView?: (view: ReanchorView) => void;
  /** Optional: hide / close the active reanchor view. */
  hideReanchorView?: () => void;
  /** Render width hint. Default 80. */
  width?: number;
}

export interface CrewSessionOptions {
  session_id: string;
  manifest: CrewManifest;
  goal: string;
  /** Initial phase list. Updated via {@link CrewSession.setPhases}. */
  phases: CrewPhase[];
  strict_mode?: boolean;
  auto_advance_timer_ms?: number;
}

export class CrewSession {
  readonly coordinator: CheckpointCoordinator;
  private host: CrewSessionHost;
  private opts: CrewSessionOptions;
  private currentPhaseSummaryView: PhaseSummaryView | null = null;
  private currentReanchorView: ReanchorView | null = null;
  private countdownInterval: NodeJS.Timeout | null = null;
  private gateOpenedAt = 0;
  private gateAutoAdvanceMs: number | null = null;
  private lastEscapeAt = 0;

  constructor(opts: CrewSessionOptions, host: CrewSessionHost) {
    this.opts = opts;
    this.host = host;
    this.coordinator = CheckpointCoordinator.tui({
      strict_mode: opts.strict_mode,
      auto_advance_timer_ms: opts.auto_advance_timer_ms,
    });
    setActiveCrew({
      coordinator: this.coordinator,
      session_id: opts.session_id,
      manifest: opts.manifest,
      goal: opts.goal,
      phases: opts.phases,
      current_phase_index: -1,
    });
    setActiveCrewEscapeHandler(() => this.handleEscape());
    this.attachListeners();
  }

  /** Shut down: clear interval, drop the active registration. */
  dispose(): void {
    this.stopCountdown();
    this.currentPhaseSummaryView = null;
    this.currentReanchorView = null;
    this.host.hidePhaseSummaryView?.();
    this.host.hideReanchorView?.();
    setActiveCrewEscapeHandler(null);
    clearActiveCrew();
  }

  /** Update the live phase list as the runner advances. */
  setPhases(phases: CrewPhase[], current_phase_index: number): void {
    updateActiveCrewProgress({ phases, current_phase_index });
    this.opts = { ...this.opts, phases };
  }

  /**
   * First Escape press = pause. Second within DOUBLE_ESCAPE_WINDOW_MS = abort.
   * Returns the action taken (for the caller to flash a message).
   */
  handleEscape(now = Date.now()): "pause" | "abort" | "noop" {
    if (this.coordinator.getStatus().mode !== "tui") return "noop";
    if (
      this.lastEscapeAt > 0 &&
      now - this.lastEscapeAt <= DOUBLE_ESCAPE_WINDOW_MS
    ) {
      this.lastEscapeAt = 0;
      this.coordinator.requestAbort();
      this.host.addMessage(
        "system",
        `${defaultTheme.error(ICONS.aborted)} Aborting crew run.`,
      );
      this.host.requestRender();
      return "abort";
    }
    this.lastEscapeAt = now;
    if (!this.coordinator.isPaused()) {
      this.coordinator.requestPause();
      this.host.addMessage(
        "system",
        `${defaultTheme.warning(ICONS.hourglass)} Paused — press Escape again within 2s to abort, or /continue to resume.`,
      );
      this.host.requestRender();
    }
    return "pause";
  }

  /**
   * Render a phase summary view in response to coordinator:phase_pause.
   * Exposed so tests can drive the host directly without re-wiring listeners.
   */
  presentPhaseSummary(props: PhaseSummaryViewProps): void {
    const view = new PhaseSummaryView(`phase-summary-${props.phase.id}`, props);
    this.currentPhaseSummaryView = view;
    if (this.host.showPhaseSummaryView) {
      this.host.showPhaseSummaryView(view);
    } else {
      this.host.addMessage("system", view.render(this.host.width ?? 80).join("\n"));
    }
    this.host.requestRender();
  }

  presentReanchor(reanchor: ReanchorPrompt): void {
    const view = new ReanchorView("reanchor", {
      reanchor,
      current_goal: this.opts.goal,
    });
    this.currentReanchorView = view;
    if (this.host.showReanchorView) {
      this.host.showReanchorView(view);
    } else {
      this.host.addMessage("system", view.render(this.host.width ?? 80).join("\n"));
    }
    this.host.requestRender();
  }

  /** Test seam — current phase summary view if any. */
  getCurrentPhaseSummaryView(): PhaseSummaryView | null {
    return this.currentPhaseSummaryView;
  }
  getCurrentReanchorView(): ReanchorView | null {
    return this.currentReanchorView;
  }

  private attachListeners(): void {
    this.coordinator.on(
      "checkpoint:phase_pause",
      (e: {
        phase_id: string;
        summary_artifact_id: string;
        strict_mode: boolean;
        auto_advance_ms: number | null;
      }) => {
        debugLog("info", "crew", "ui:phase_pause", { data: e });
        this.gateOpenedAt = Date.now();
        this.gateAutoAdvanceMs = e.auto_advance_ms;
        this.startCountdownIfNeeded();
      },
    );

    this.coordinator.on(
      "checkpoint:phase_resumed",
      (e: { phase_id: string; action: string }) => {
        debugLog("info", "crew", "ui:phase_resumed", { data: e });
        this.stopCountdown();
        this.currentPhaseSummaryView = null;
        this.host.hidePhaseSummaryView?.();
        this.host.requestRender();
      },
    );

    this.coordinator.on("checkpoint:auto_advance", (e: { phase_id: string }) => {
      debugLog("info", "crew", "ui:auto_advance", { data: e });
      this.stopCountdown();
      this.currentPhaseSummaryView = null;
      this.host.hidePhaseSummaryView?.();
      this.host.addMessage(
        "system",
        `${defaultTheme.dim(ICONS.arrow)} auto-advancing to next phase.`,
      );
      this.host.requestRender();
    });

    this.coordinator.on(
      "checkpoint:reanchor_open",
      (e: { reanchor: ReanchorPrompt }) => {
        debugLog("info", "crew", "ui:reanchor_open", { data: {} });
        this.presentReanchor(e.reanchor);
      },
    );

    this.coordinator.on(
      "checkpoint:reanchor_resolved",
      (e: { option: string; new_goal?: string }) => {
        debugLog("info", "crew", "ui:reanchor_resolved", { data: e });
        this.currentReanchorView = null;
        this.host.hideReanchorView?.();
        this.host.requestRender();
      },
    );

    this.coordinator.on("checkpoint:user_paused", () => {
      this.host.addMessage(
        "system",
        `${defaultTheme.warning(ICONS.hourglass)} Crew paused. /continue to resume.`,
      );
      this.host.requestRender();
    });

    this.coordinator.on("checkpoint:user_resumed", () => {
      this.host.addMessage(
        "system",
        `${defaultTheme.success(ICONS.success)} Crew resumed.`,
      );
      this.host.requestRender();
    });

    this.coordinator.on("checkpoint:user_aborted", () => {
      this.host.addMessage(
        "system",
        `${defaultTheme.error(ICONS.aborted)} Abort signaled — exiting at next safe point.`,
      );
      this.host.requestRender();
    });
  }

  private startCountdownIfNeeded(): void {
    if (this.gateAutoAdvanceMs === null) return;
    this.stopCountdown();
    this.countdownInterval = setInterval(() => {
      const view = this.currentPhaseSummaryView;
      if (!view) {
        this.stopCountdown();
        return;
      }
      const elapsed = Date.now() - this.gateOpenedAt;
      const remaining = Math.max(0, (this.gateAutoAdvanceMs ?? 0) - elapsed);
      view.setProps({ auto_advance_remaining_ms: remaining });
      this.host.requestRender();
      if (remaining <= 0) this.stopCountdown();
    }, 1000);
    if (typeof this.countdownInterval.unref === "function") {
      this.countdownInterval.unref();
    }
  }

  private stopCountdown(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  /**
   * Convenience helper: when the runner produces a phase summary, call
   * this to present it. The caller has the artifact payload + meeting
   * markdown; the session wraps it into a PhaseSummaryView.
   */
  presentPhaseGate(args: {
    phase: CrewPhase;
    payload: PhaseSummaryArtifactPayload;
    meeting_markdown?: string;
    drift_score?: number;
  }): void {
    this.presentPhaseSummary({
      phase: args.phase,
      payload: args.payload,
      meeting_markdown: args.meeting_markdown,
      drift_score: args.drift_score,
      strict_mode: this.coordinator.isStrictMode(),
      auto_advance_remaining_ms:
        this.gateAutoAdvanceMs ?? undefined,
    });
  }
}
