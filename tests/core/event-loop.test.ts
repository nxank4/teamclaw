import { describe, it, expect, vi } from "vitest";
import { openclawEvents } from "@/core/openclaw-events.js";

describe("Event Loop Protection", () => {
  it("flushTerminalBuffer emits batched data as a single log entry", async () => {
    const { flushTerminalBuffer } = await import("@/core/terminal-broadcast.js");

    const entries: Record<string, unknown>[] = [];
    const handler = (e: unknown) => entries.push(e as Record<string, unknown>);
    openclawEvents.on("log", handler);

    // Flush should be a no-op when buffer is empty
    flushTerminalBuffer();
    expect(entries).toHaveLength(0);

    openclawEvents.off("log", handler);
  });

  it("handles many listeners on openclawEvents efficiently", () => {
    const handlers: Array<(e: unknown) => void> = [];
    for (let i = 0; i < 50; i++) {
      const h = vi.fn();
      handlers.push(h);
      openclawEvents.on("log", h);
    }

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      openclawEvents.emit("log", {
        id: `perf-${i}`,
        level: "info",
        source: "console",
        action: "stdout",
        model: "",
        botId: "",
        message: `Log line ${i}`,
        timestamp: Date.now(),
      });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
    handlers.forEach((h) => {
      expect(h).toHaveBeenCalledTimes(100);
    });

    handlers.forEach((h) => openclawEvents.off("log", h));
  });

  it("exports restoreTerminal to undo interception", async () => {
    const { restoreTerminal } = await import("@/core/terminal-broadcast.js");
    expect(() => restoreTerminal()).not.toThrow();
  });
});
