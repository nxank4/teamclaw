/**
 * Performance monitor — runtime instrumentation for TUI lag diagnosis.
 *
 * Activation: OPENPAWL_DEBUG_PERF=1
 * Zero overhead when disabled: every method checks `enabled` first.
 *
 * Tracks per render cycle: render time, message count, visible messages,
 * lines generated, input latency, scroll latency, ANSI buffer size.
 * Logs JSON lines to ~/.openpawl/perf.log and provides a live overlay line.
 */
import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface PerfSample {
  ts: number;
  renderMs: number;
  msgCount: number;
  visibleMsgCount: number;
  linesGenerated: number;
  inputMs: number;
  scrollMs: number;
  ansiLength: number;
}

const LOG_PATH = join(homedir(), ".openpawl", "perf.log");
const MAX_SAMPLES = 60;

function ensureDir(): void {
  const dir = join(homedir(), ".openpawl");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export const PERF = {
  enabled: process.env.OPENPAWL_DEBUG_PERF === "1",

  // Internal state
  _renderStart: 0,
  _inputStart: 0,
  _scrollStart: 0,
  _lastInputMs: 0,
  _lastScrollMs: 0,
  _ansiLength: 0,
  _msgCount: 0,
  _visibleMsgCount: 0,
  _linesGenerated: 0,
  _samples: [] as PerfSample[],
  _logInitialized: false,

  beginRender(): void {
    if (!this.enabled) return;
    this._renderStart = performance.now();
  },

  endRender(): void {
    if (!this.enabled) return;
    const renderMs = performance.now() - this._renderStart;

    const sample: PerfSample = {
      ts: Date.now(),
      renderMs,
      msgCount: this._msgCount,
      visibleMsgCount: this._visibleMsgCount,
      linesGenerated: this._linesGenerated,
      inputMs: this._lastInputMs,
      scrollMs: this._lastScrollMs,
      ansiLength: this._ansiLength,
    };

    this._samples.push(sample);
    if (this._samples.length > MAX_SAMPLES) {
      this._samples.shift();
    }

    // Log to file
    if (!this._logInitialized) {
      ensureDir();
      this._logInitialized = true;
    }
    try {
      appendFileSync(LOG_PATH, JSON.stringify(sample) + "\n");
    } catch { /* ignore write errors */ }

    // Reset per-cycle counters
    this._lastInputMs = 0;
    this._lastScrollMs = 0;
  },

  markInputStart(): void {
    if (!this.enabled) return;
    this._inputStart = performance.now();
  },

  markInputEnd(): void {
    if (!this.enabled) return;
    this._lastInputMs = performance.now() - this._inputStart;
  },

  markScrollStart(): void {
    if (!this.enabled) return;
    this._scrollStart = performance.now();
  },

  markScrollEnd(): void {
    if (!this.enabled) return;
    this._lastScrollMs = performance.now() - this._scrollStart;
  },

  setAnsiLength(len: number): void {
    if (!this.enabled) return;
    this._ansiLength = len;
  },

  setMessageStats(msgCount: number, visibleMsgCount: number, linesGenerated: number): void {
    if (!this.enabled) return;
    this._msgCount = msgCount;
    this._visibleMsgCount = visibleMsgCount;
    this._linesGenerated = linesGenerated;
  },


  getLast(): PerfSample | null {
    return this._samples.length > 0 ? this._samples[this._samples.length - 1]! : null;
  },
};
