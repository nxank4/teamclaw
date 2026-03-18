/**
 * Tests for src/core/canvas-telemetry.ts
 *
 * Canvas telemetry is currently disabled (OpenClaw gateway removed).
 * These tests verify it gracefully no-ops.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockConnect, mockClose, mockSend } = vi.hoisted(() => ({
  mockConnect: vi.fn(),
  mockClose: vi.fn(),
  mockSend: vi.fn(),
}));

vi.mock("@/core/ws-manager.js", () => ({
  wsManager: {
    connect: mockConnect,
    close: mockClose,
    send: mockSend,
  },
}));

vi.mock("@/core/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), agent: vi.fn(), debug: vi.fn() },
  isDebugMode: () => false,
}));

describe("CanvasTelemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("connect() returns false when no gateway is configured", async () => {
    const mod = await import("@/core/canvas-telemetry.js");
    const t = new mod.CanvasTelemetry();
    expect(await t.connect()).toBe(false);
  });

  it("disconnect() calls wsManager.close()", async () => {
    const mod = await import("@/core/canvas-telemetry.js");
    const t = new mod.CanvasTelemetry();
    t.disconnect();
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
