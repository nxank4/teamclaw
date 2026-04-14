/**
 * Thinking indicator — animated pen-writing spinner shown while waiting
 * for LLM response. Starts immediately on prompt submit, stops when
 * first token arrives. Shows fun rotating messages when loading takes a while.
 */
import { ctp } from "../themes/default.js";
import { createPenAnimation } from "./pen-spinner.js";

const FRAME_INTERVAL = 150;

/** Seconds before switching from "Thinking..." to a fun message. */
const SLOW_THRESHOLD = 3;
/** Seconds between fun message rotations. */
const MESSAGE_ROTATE_INTERVAL = 5;

const LOADING_MESSAGES = [
  "Brewing some intelligence...",
  "Warming up the neurons...",
  "Caffeinating the AI...",
  "Assembling your team...",
  "Your agents are stretching...",
  "Team huddle in progress...",
  "Rolling out the red carpet for your agents...",
  "Downloading more RAM... just kidding",
  "Convincing electrons to think...",
  "Teaching bits to be smart...",
  "Spinning up the hamster wheels...",
  "Polishing the crystal ball...",
  "Consulting the oracle...",
  "It's not a bug, it's a loading screen...",
  "Reticulating splines...",
  "Compiling witty responses...",
  "sudo make me a sandwich...",
  "while (loading) { patience++; }",
  "git pull origin intelligence",
  "Good things take a moment...",
  "Almost there, promise...",
  "Worth the wait...",
  "Preparing something special...",
];

const FIRST_RUN_MESSAGES = [
  "First time? This takes a minute — go stretch...",
  "Downloading the brain... one-time setup...",
  "Building your workspace — only happens once...",
  "First boot — your patience will be rewarded...",
  "Unpacking the AI toolkit for the first time...",
  "Setting up camp — this is a one-time thing...",
];

function pickRandom(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export class ThinkingIndicator {
  private interval: ReturnType<typeof setInterval> | null = null;
  private slowTimer: ReturnType<typeof setTimeout> | null = null;
  private rotateTimer: ReturnType<typeof setInterval> | null = null;
  private penAnim = createPenAnimation();
  private visible = false;
  private slow = false;
  private currentMessage = "";
  private agentName: string | null = null;
  private agentColorFn: ((s: string) => string) | null = null;
  private isFirstRun = false;

  /** Callback to update the displayed text (called on each frame). */
  onUpdate?: (text: string) => void;

  start(agentName?: string, agentColorFn?: (s: string) => string): void {
    this.stop();
    this.visible = true;
    this.slow = false;
    this.currentMessage = "";
    this.agentName = agentName ?? null;
    this.agentColorFn = agentColorFn ?? null;
    this.penAnim = createPenAnimation();
    this.emitFrame();
    this.interval = setInterval(() => this.emitFrame(), FRAME_INTERVAL);
    this.slowTimer = setTimeout(() => {
      this.slow = true;
      this.rotateMessage();
      this.rotateTimer = setInterval(() => this.rotateMessage(), MESSAGE_ROTATE_INTERVAL * 1000);
    }, SLOW_THRESHOLD * 1000);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.slowTimer) {
      clearTimeout(this.slowTimer);
      this.slowTimer = null;
    }
    if (this.rotateTimer) {
      clearInterval(this.rotateTimer);
      this.rotateTimer = null;
    }
    this.visible = false;
    this.slow = false;
  }

  /** Mark as first run for first-run-specific messages. */
  setFirstRun(firstRun: boolean): void {
    this.isFirstRun = firstRun;
  }

  isVisible(): boolean {
    return this.visible;
  }

  /** Get current frame text (for rendering in components). */
  getCurrentText(): string {
    if (!this.visible) return "";
    const pen = this.penAnim();
    const spinner = ctp.teal(pen || " ");

    if (this.slow && this.currentMessage) {
      if (this.agentName && this.agentColorFn) {
        return `${spinner} ${this.agentColorFn(`[${this.agentName}]`)} ${ctp.teal(this.currentMessage)}`;
      }
      return `${spinner} ${ctp.teal(this.currentMessage)}`;
    }

    if (this.agentName && this.agentColorFn) {
      return `${spinner} ${this.agentColorFn(`[${this.agentName}]`)} ${ctp.teal("is thinking...")}`;
    }
    return `${spinner} ${ctp.teal("Thinking...")}`;
  }

  private rotateMessage(): void {
    const pool = this.isFirstRun ? FIRST_RUN_MESSAGES : LOADING_MESSAGES;
    this.currentMessage = pickRandom(pool);
  }

  private emitFrame(): void {
    this.onUpdate?.(this.getCurrentText());
  }
}
