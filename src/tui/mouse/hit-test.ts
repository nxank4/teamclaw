/**
 * Hit tester — maps screen coordinates to interactive elements.
 * Cleared before every re-render. O(n) lookup where n = visible elements.
 */
import type { InteractiveElement } from "./types.js";

export class HitTester {
  private elements: InteractiveElement[] = [];

  /** Register an interactive region (called during render). */
  register(element: InteractiveElement): void {
    this.elements.push(element);
  }

  /** Clear all regions (called before re-render). */
  clear(): void {
    this.elements = [];
  }

  /** Find the element at screen position (1-based x, y). Last registered wins on overlap. */
  hitTest(x: number, y: number): InteractiveElement | null {
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i]!;
      if (x >= el.region.x1 && x <= el.region.x2 &&
          y >= el.region.y1 && y <= el.region.y2) {
        return el;
      }
    }
    return null;
  }

  /** Get all registered elements. */
  getAll(): InteractiveElement[] {
    return [...this.elements];
  }

  /** Count of registered elements. */
  get count(): number {
    return this.elements.length;
  }
}
