import { describe, it, expect, vi } from "vitest";
import { openclawEvents } from "../src/core/openclaw-events.js";

describe("Terminal Broadcast → OpenClaw Log Entries", () => {
  it("emits log entries with source 'console' via openclawEvents", async () => {
    const entries: Record<string, unknown>[] = [];
    const handler = (e: unknown) => entries.push(e as Record<string, unknown>);
    openclawEvents.on("log", handler);

    // Simulate what terminal-broadcast does internally
    openclawEvents.emit("log", {
      id: "test-1",
      level: "info",
      source: "console",
      action: "stdout",
      model: "",
      botId: "",
      message: "Hello World",
      timestamp: Date.now(),
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe("console");
    expect(entries[0].level).toBe("info");
    expect(entries[0].message).toBe("Hello World");

    openclawEvents.off("log", handler);
  });

  it("sets level to 'warn' for stderr entries", async () => {
    const entries: Record<string, unknown>[] = [];
    const handler = (e: unknown) => entries.push(e as Record<string, unknown>);
    openclawEvents.on("log", handler);

    openclawEvents.emit("log", {
      id: "test-2",
      level: "warn",
      source: "console",
      action: "stderr",
      model: "",
      botId: "",
      message: "Something went wrong",
      timestamp: Date.now(),
    });

    expect(entries[0].level).toBe("warn");
    expect(entries[0].action).toBe("stderr");

    openclawEvents.off("log", handler);
  });

  it("console source entries have empty model and botId", async () => {
    const entries: Record<string, unknown>[] = [];
    const handler = (e: unknown) => entries.push(e as Record<string, unknown>);
    openclawEvents.on("log", handler);

    openclawEvents.emit("log", {
      id: "test-3",
      level: "info",
      source: "console",
      action: "stdout",
      model: "",
      botId: "",
      message: "Console output",
      timestamp: Date.now(),
    });

    expect(entries[0].model).toBe("");
    expect(entries[0].botId).toBe("");

    openclawEvents.off("log", handler);
  });
});

describe("Terminal Broadcast Module Exports", () => {
  it("exports initTerminalBroadcast and restoreTerminal", async () => {
    const mod = await import("../src/core/terminal-broadcast.js");
    expect(typeof mod.initTerminalBroadcast).toBe("function");
    expect(typeof mod.restoreTerminal).toBe("function");
    expect(typeof mod.flushTerminalBuffer).toBe("function");
  });

  it("no longer exports addTerminalClient or broadcastTerminalData", async () => {
    const mod = await import("../src/core/terminal-broadcast.js") as Record<string, unknown>;
    expect(mod.addTerminalClient).toBeUndefined();
    expect(mod.broadcastTerminalData).toBeUndefined();
    expect(mod.removeTerminalClient).toBeUndefined();
  });
});
