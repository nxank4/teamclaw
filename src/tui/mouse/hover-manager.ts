/**
 * Hover manager — tracks which element is hovered, triggers re-render on change.
 * Only fires events when hover state actually changes (enter/leave).
 */
import type { InteractiveElement } from "./types.js";
import type { HitTester } from "./hit-test.js";

export class HoverManager {
  private currentHover: InteractiveElement | null = null;
  private enabled = true;

  /** Called when re-render needed (to show/remove hover effect). */
  onRequestRender?: () => void;
  /** Called when tooltip should be shown in status bar. */
  onTooltip?: (text: string | null) => void;

  /** Process mouse move event. */
  onMouseMove(x: number, y: number, hitTester: HitTester): void {
    if (!this.enabled) return;

    const element = hitTester.hitTest(x, y);

    if (element === this.currentHover) return; // no change

    // Leave previous
    if (this.currentHover) {
      this.currentHover.onLeave?.();
    }

    // Enter new
    if (element) {
      element.onHover?.();
      this.onTooltip?.(element.tooltip ?? null);
    } else {
      this.onTooltip?.(null);
    }

    this.currentHover = element;
    this.onRequestRender?.();
  }

  /** Process click event. Returns true if an element was clicked. */
  onClick(x: number, y: number, hitTester: HitTester): boolean {
    const element = hitTester.hitTest(x, y);
    if (element) {
      element.onClick();
      return true;
    }
    return false;
  }

  /** Get currently hovered element (for rendering hover effects). */
  getHovered(): InteractiveElement | null {
    return this.currentHover;
  }

  /** Check if a specific element is hovered. */
  isHovered(id: string): boolean {
    return this.currentHover?.id === id;
  }

  /** Disable hover tracking (during streaming). */
  disable(): void {
    this.enabled = false;
    if (this.currentHover) {
      this.currentHover.onLeave?.();
      this.currentHover = null;
      this.onTooltip?.(null);
    }
  }

  /** Re-enable hover tracking. */
  enable(): void {
    this.enabled = true;
  }

  /** Clear state (on re-render). */
  clearHover(): void {
    this.currentHover = null;
  }
}
