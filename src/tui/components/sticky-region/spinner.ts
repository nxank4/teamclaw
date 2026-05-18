/**
 * 100ms spinner timer for the sticky region. One per region instance.
 * Self-pauses when the stack is empty so an idle TUI has no background
 * ticks.
 */
import { SPINNER_FRAME_COUNT } from "./sticky-block.js";

const TICK_MS = 100;

export class SpinnerTimer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame = 0;

  constructor(private readonly onTick: () => void) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % SPINNER_FRAME_COUNT;
      this.onTick();
    }, TICK_MS);
    if (this.timer.unref) this.timer.unref();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Current frame index, mod SPINNER_FRAME_COUNT. */
  frameIndex(): number {
    return this.frame;
  }

  /** Visible-for-tests. */
  running(): boolean {
    return this.timer !== null;
  }
}
