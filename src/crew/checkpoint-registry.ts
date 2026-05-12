/**
 * Process-wide registry for the active CheckpointCoordinator.
 *
 * The TUI / headless host registers a coordinator at the start of a
 * crew run and clears it on completion. Slash commands resolve the
 * active coordinator through this module so they can signal
 * pause/abort/etc without holding a direct reference to the runner.
 *
 * Single-active by design — only one crew runs per process at a time
 * in v0.4. Future multi-session support would key by session id.
 *
 * Manifest registration is parallel: it lets the read-only `/crew`
 * status command surface the active crew composition without poking
 * at the runner's internals.
 */
import type { CheckpointCoordinator } from "./checkpoints.js";
import type { CrewManifest } from "./manifest/index.js";
import type { CrewPhase } from "./types.js";

interface ActiveCrewRecord {
  coordinator: CheckpointCoordinator;
  session_id: string;
  manifest: CrewManifest;
  goal: string;
  /** Live-updated phase list. The host updates this as phases progress. */
  phases?: CrewPhase[];
  /** Index of the in-progress phase (0-based). */
  current_phase_index?: number;
}

let active: ActiveCrewRecord | null = null;

export function setActiveCrew(record: ActiveCrewRecord): void {
  active = record;
}

export function clearActiveCrew(): void {
  active = null;
}

export function getActiveCrew(): ActiveCrewRecord | null {
  return active;
}

export function getActiveCheckpointCoordinator(): CheckpointCoordinator | null {
  return active?.coordinator ?? null;
}

/**
 * Update the live phase list / current index. Called by the host as
 * phases advance so /crew can show the up-to-date snapshot.
 */
export function updateActiveCrewProgress(patch: {
  phases?: CrewPhase[];
  current_phase_index?: number;
}): void {
  if (!active) return;
  active = { ...active, ...patch };
}
