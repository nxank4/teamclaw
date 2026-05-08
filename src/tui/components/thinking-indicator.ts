/**
 * Thinking indicator — animated 4-frame box spinner paired with rotating
 * P-themed words. Shown during idle / waiting periods within a dispatch
 * (no active tool call). Caller stops it as soon as a real progress
 * tree node lands and restarts it once the run goes idle again, so the
 * animation only fills the gaps the user actually has to wait through.
 */
import { ctp } from "../themes/default.js";

const FRAME_INTERVAL = 500;

const FRAMES = ["❏", "❐", "❑", "❒"];

const WORDS = [
  "Pondering", "Plotting", "Pawing", "Polishing",
  "Pruning", "Probing", "Procuring", "Provisioning",
  "Percolating", "Permuting", "Parsing", "Palavering",
  "Prowling", "Pouncing", "Padding", "Purring",
];

/** Pick `count` distinct elements from `pool` uniformly at random. */
function pickWords(count: number, pool: readonly string[]): string[] {
  const copy = [...pool];
  const out: string[] = [];
  const take = Math.min(count, copy.length);
  for (let i = 0; i < take; i++) {
    const j = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(j, 1)[0]!);
  }
  return out;
}

export class ThinkingIndicator {
  private interval: ReturnType<typeof setInterval> | null = null;
  private frameIdx = 0;
  private words: string[] = [];
  private visible = false;
  private agentName: string | null = null;
  private agentColorFn: ((s: string) => string) | null = null;

  /** Callback to update the displayed text (called on each frame). */
  onUpdate?: (text: string) => void;

  start(agentName?: string, agentColorFn?: (s: string) => string): void {
    this.stop();
    this.visible = true;
    this.frameIdx = 0;
    // Re-pick on every start. Each idle gap within a run shows a fresh
    // 4-word selection so the animation never feels stuck on the same
    // four words across phases.
    this.words = pickWords(FRAMES.length, WORDS);
    this.agentName = agentName ?? null;
    this.agentColorFn = agentColorFn ?? null;
    this.emitFrame();
    this.interval = setInterval(() => {
      this.frameIdx = (this.frameIdx + 1) % FRAMES.length;
      this.emitFrame();
    }, FRAME_INTERVAL);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.visible = false;
  }

  isVisible(): boolean {
    return this.visible;
  }

  /** Get current frame text (for rendering in components). */
  getCurrentText(): string {
    if (!this.visible) return "";
    const frame = FRAMES[this.frameIdx]!;
    const word = this.words[this.frameIdx] ?? "Thinking";
    const body = `${frame} ${word}...`;
    if (this.agentName && this.agentColorFn) {
      return `${this.agentColorFn(`[${this.agentName}]`)} ${ctp.teal(body)}`;
    }
    return ctp.teal(body);
  }

  private emitFrame(): void {
    this.onUpdate?.(this.getCurrentText());
  }
}

/** Exported for tests and downstream tooling. */
export const THINKING_FRAMES: readonly string[] = FRAMES;
export const THINKING_WORDS: readonly string[] = WORDS;
