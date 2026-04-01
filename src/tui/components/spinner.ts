/**
 * Animated spinner component.
 */
import type { Component } from "../core/component.js";
import { defaultTheme } from "../themes/default.js";

export class SpinnerComponent implements Component {
  readonly id: string;
  private message: string;
  private frame = 0;
  private frames: string[];
  private timer: ReturnType<typeof setInterval> | null = null;
  private requestRender: (() => void) | null = null;

  constructor(id: string, message = "", frames?: string[]) {
    this.id = id;
    this.message = message;
    this.frames = frames ?? defaultTheme.symbols.spinner;
  }

  render(_width: number): string[] {
    const spinner = this.frames[this.frame % this.frames.length] ?? "·";
    return [this.message ? `${spinner} ${this.message}` : spinner];
  }

  /** Set the render callback (called by TUI when spinner needs to request re-renders). */
  setRenderCallback(fn: () => void): void {
    this.requestRender = fn;
  }

  /** Start the spinner animation. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.frame++;
      this.requestRender?.();
    }, 80);
    // Don't block process exit
    if (this.timer.unref) this.timer.unref();
  }

  /** Stop the spinner animation. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setMessage(message: string): void {
    this.message = message;
  }

  onMount(): void {
    this.start();
  }

  onUnmount(): void {
    this.stop();
  }
}
