/**
 * Hook that lets keybindings-setup forward Escape to the active
 * CrewSession without importing CrewSession directly (which would pull
 * in the crew runtime tree on every TUI startup).
 *
 * The CrewSession registers a closure here on construction and clears
 * it on dispose.
 */
export type CrewEscapeResult = "pause" | "abort" | "noop";

let activeEscapeHandler: (() => CrewEscapeResult) | null = null;

export function setActiveCrewEscapeHandler(
  handler: (() => CrewEscapeResult) | null,
): void {
  activeEscapeHandler = handler;
}

export function getActiveCrewEscapeHandler(): (() => CrewEscapeResult) | null {
  return activeEscapeHandler;
}
