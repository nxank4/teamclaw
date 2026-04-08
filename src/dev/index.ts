/**
 * Dev mode — built-in diagnostics for OpenPawl TUI.
 *
 * Activation:
 *   openpawl --dev
 *   OPENPAWL_DEV=1 openpawl
 *   /dev (runtime toggle)
 *
 * Zero overhead when disabled: every method checks `enabled` first.
 */
import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const LOG_DIR = join(homedir(), ".openpawl", "logs");

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

export const DEV = {
  enabled: false,

  // Frame perf tracking
  frameStart: 0,
  frameTime: 0,
  writeCount: 0,
  writtenBytes: 0,

  // FPS tracking
  frameTimes: [] as number[],
  fps: 0,
  private_fpsInterval: null as ReturnType<typeof setInterval> | null,

  /** Initialize dev mode. Call once at startup. */
  init(): void {
    this.enabled = process.env.OPENPAWL_DEV === "1" || process.argv.includes("--dev");
    if (!this.enabled) return;

    ensureLogDir();

    // Monkey-patch stdout.write to track writes
    const origWrite = process.stdout.write.bind(process.stdout) as (chunk: string | Uint8Array, cb?: () => void) => boolean;
    process.stdout.write = ((data: string | Uint8Array, encodingOrCb?: BufferEncoding | (() => void), cb?: () => void) => {
      this.writeCount++;
      this.writtenBytes += typeof data === "string" ? data.length : data.byteLength;
      if (typeof encodingOrCb === "function") return origWrite(data, encodingOrCb);
      if (cb) return origWrite(data, cb);
      return origWrite(data);
    }) as typeof process.stdout.write;

    // FPS counter — compute every second
    this.private_fpsInterval = setInterval(() => {
      const now = performance.now();
      this.frameTimes = this.frameTimes.filter((t) => now - t < 1000);
      this.fps = this.frameTimes.length;
    }, 1000);
  },

  /** Toggle dev mode at runtime. */
  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled) ensureLogDir();
    return this.enabled;
  },

  /** Call at the start of each render frame. */
  beginFrame(): void {
    if (!this.enabled) return;
    this.frameStart = performance.now();
    this.writeCount = 0;
    this.writtenBytes = 0;
  },

  /** Call at the end of each render frame. */
  endFrame(): void {
    if (!this.enabled) return;
    this.frameTime = performance.now() - this.frameStart;
    this.frameTimes.push(performance.now());

    // Log slow frames (>10ms)
    if (this.frameTime > 10) {
      this.logSlow();
    }
  },

  /** Log a slow frame to perf.log. */
  logSlow(): void {
    try {
      const line = `${new Date().toISOString()} | frame:${this.frameTime.toFixed(1)}ms | writes:${this.writeCount} | bytes:${formatBytes(this.writtenBytes)} | heap:${formatBytes(process.memoryUsage().heapUsed)}\n`;
      appendFileSync(join(LOG_DIR, "perf.log"), line);
    } catch { /* ignore write errors */ }
  },

  /** Log a raw input event. */
  logInput(hex: string, parsed: string): void {
    if (!this.enabled) return;
    try {
      const line = `${new Date().toISOString()} | hex:${hex} | parsed:${parsed}\n`;
      appendFileSync(join(LOG_DIR, "input.log"), line);
    } catch { /* ignore */ }
  },

  /** Get overlay lines for the perf display. */
  getOverlayLines(): string[] {
    if (!this.enabled) return [];
    const heap = process.memoryUsage().heapUsed;
    return [
      "┌ dev ──────────┐",
      `│ frame: ${this.frameTime.toFixed(1).padStart(5)}ms │`,
      `│ writes: ${String(this.writeCount).padStart(5)} │`,
      `│ bytes: ${formatBytes(this.writtenBytes).padStart(6)} │`,
      `│ fps: ${String(this.fps).padStart(7)} │`,
      `│ heap: ${formatBytes(heap).padStart(6)} │`,
      "└───────────────┘",
    ];
  },

  /** Cleanup on exit. */
  destroy(): void {
    if (this.private_fpsInterval) {
      clearInterval(this.private_fpsInterval);
      this.private_fpsInterval = null;
    }
  },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}b`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}kb`;
  return `${(bytes / (1024 * 1024)).toFixed(0)}mb`;
}
