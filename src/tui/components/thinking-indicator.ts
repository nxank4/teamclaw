/**
 * Thinking indicator — animated 4-frame box spinner paired with a
 * rotating P-themed word. Shown during idle / waiting periods within a
 * dispatch (no active tool call). Caller stops it as soon as a real
 * progress tree node lands and restarts it once the run goes idle
 * again, so the animation only fills the gaps the user actually has to
 * wait through.
 *
 * Symbol and word advance on independent intervals so the box spins
 * smoothly (200ms / 800ms full loop) while the word stays put long
 * enough to read (3s). Coupling the two — as PR #119's first cut did —
 * made the word flicker faster than the eye could follow.
 */
import { ctp } from "../themes/default.js";

const SYMBOL_INTERVAL_MS = 200;
const WORD_INTERVAL_MS = 3000;

const FRAMES = ["❏", "❐", "❑", "❒"];

const WORDS = [
  "Pondering", "Plotting", "Pawing", "Polishing",
  "Pruning", "Probing", "Procuring", "Provisioning",
  "Percolating", "Permuting", "Parsing", "Palavering",
  "Prowling", "Pouncing", "Padding", "Purring",
];

export interface ThinkingIndicatorOptions {
  /** Override the 200ms symbol cadence (mostly for tests). */
  symbolIntervalMs?: number;
  /** Override the 3000ms word-rotation cadence (mostly for tests). */
  wordIntervalMs?: number;
}

export class ThinkingIndicator {
  private symbolInterval: ReturnType<typeof setInterval> | null = null;
  private wordInterval: ReturnType<typeof setInterval> | null = null;
  private frameIdx = 0;
  private currentWord = "";
  /**
   * Words shown so far in the current crew run. Persists across
   * stop()/start() cycles so an idle gap between subagents picks a
   * word the user has not seen yet. Reset via {@link resetRun} at the
   * start of a new dispatch.
   */
  private usedWords = new Set<string>();
  private visible = false;
  private agentName: string | null = null;
  private agentColorFn: ((s: string) => string) | null = null;
  private readonly symbolIntervalMs: number;
  private readonly wordIntervalMs: number;

  /** Callback to update the displayed text (called on each frame). */
  onUpdate?: (text: string) => void;

  constructor(opts: ThinkingIndicatorOptions = {}) {
    this.symbolIntervalMs = opts.symbolIntervalMs ?? SYMBOL_INTERVAL_MS;
    this.wordIntervalMs = opts.wordIntervalMs ?? WORD_INTERVAL_MS;
  }

  start(agentName?: string, agentColorFn?: (s: string) => string): void {
    this.stop();
    this.visible = true;
    this.frameIdx = 0;
    this.currentWord = this.pickNextWord();
    this.agentName = agentName ?? null;
    this.agentColorFn = agentColorFn ?? null;
    this.emitFrame();
    // Symbol cadence: smooth motion. Each tick advances the frame
    // index but leaves the word untouched.
    this.symbolInterval = setInterval(() => {
      this.frameIdx = (this.frameIdx + 1) % FRAMES.length;
      this.emitFrame();
    }, this.symbolIntervalMs);
    // Word cadence: slow rotation so the word stays readable.
    this.wordInterval = setInterval(() => {
      this.currentWord = this.pickNextWord();
      this.emitFrame();
    }, this.wordIntervalMs);
  }

  stop(): void {
    if (this.symbolInterval) {
      clearInterval(this.symbolInterval);
      this.symbolInterval = null;
    }
    if (this.wordInterval) {
      clearInterval(this.wordInterval);
      this.wordInterval = null;
    }
    this.visible = false;
  }

  /**
   * Reset the per-run word-history. Call at the start of a new
   * dispatch so the next set of idle gaps draws from the full pool
   * again instead of replaying the same chain across runs.
   */
  resetRun(): void {
    this.usedWords.clear();
  }

  isVisible(): boolean {
    return this.visible;
  }

  /** Get current frame text (for rendering in components). */
  getCurrentText(): string {
    if (!this.visible) return "";
    const frame = FRAMES[this.frameIdx]!;
    const word = this.currentWord || "Thinking";
    const body = `${frame} ${word}...`;
    if (this.agentName && this.agentColorFn) {
      return `${this.agentColorFn(`[${this.agentName}]`)} ${ctp.teal(body)}`;
    }
    return ctp.teal(body);
  }

  /**
   * Pick a word the user has not seen yet in this run. When the pool
   * of unseen words empties, reset and keep going — better to show a
   * repeat than freeze on the same word.
   */
  private pickNextWord(): string {
    let pool = WORDS.filter((w) => !this.usedWords.has(w));
    if (pool.length === 0) {
      this.usedWords.clear();
      pool = [...WORDS];
    }
    // Avoid an immediate re-pick of the word currently on screen when
    // the pool wraps so there is always visible motion on a tick.
    if (this.currentWord && pool.length > 1) {
      const filtered = pool.filter((w) => w !== this.currentWord);
      if (filtered.length > 0) pool = filtered;
    }
    const word = pool[Math.floor(Math.random() * pool.length)]!;
    this.usedWords.add(word);
    return word;
  }

  private emitFrame(): void {
    this.onUpdate?.(this.getCurrentText());
  }
}

/** Exported for tests and downstream tooling. */
export const THINKING_FRAMES: readonly string[] = FRAMES;
export const THINKING_WORDS: readonly string[] = WORDS;
export { SYMBOL_INTERVAL_MS, WORD_INTERVAL_MS };
