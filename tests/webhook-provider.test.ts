import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PartialApprovalTask, PartialApprovalDecision } from "../src/agents/partial-approval.js";
import type { WebhookApprovalConfig } from "../src/webhook/types.js";

const resolvers = new Map<string, (r: PartialApprovalDecision) => void>();

// Mock session-state before importing provider
vi.mock("../src/web/session-state.js", () => ({
  setTaskApprovalResolver: (id: string, fn: (r: PartialApprovalDecision) => void) => {
    resolvers.set(id, fn);
  },
  getTaskApprovalResolver: (id: string) => resolvers.get(id) ?? null,
  clearTaskApprovalResolver: (id: string) => resolvers.delete(id),
  clearAllTaskApprovalResolvers: () => resolvers.clear(),
  broadcast: () => {},
  updateSessionState: () => {},
}));

const mockDeliverApprovalRequest = vi.fn();
const mockDeliverWebhook = vi.fn();
const mockDeliverTimeoutNotification = vi.fn();

vi.mock("../src/webhook/delivery.js", () => ({
  deliverApprovalRequest: (...args: unknown[]) => mockDeliverApprovalRequest(...args),
  deliverWebhook: (...args: unknown[]) => mockDeliverWebhook(...args),
  deliverTimeoutNotification: (...args: unknown[]) => mockDeliverTimeoutNotification(...args),
}));

vi.mock("../src/core/logger.js", () => ({
  logger: { warn: () => {}, info: () => {}, error: () => {} },
}));

import { createWebhookApprovalProvider } from "../src/webhook/provider.js";

describe("webhook approval provider", () => {
  const config: WebhookApprovalConfig = {
    url: "https://hooks.example.com/approval",
    secret: "test-secret",
    provider: "generic",
    timeoutSeconds: 5,
    retryAttempts: 3,
    callbackBaseUrl: "http://localhost:9001",
    sessionId: "sess-test",
  };

  const autoTask: PartialApprovalTask = {
    task_id: "auto-1",
    description: "Auto task",
    assigned_to: "bot-1",
    confidence_score: 0.95,
    routing_decision: "auto_approve",
    is_auto_approved: true,
    rework_count: 0,
  };

  const manualTask: PartialApprovalTask = {
    task_id: "manual-1",
    description: "Manual task",
    assigned_to: "bot-2",
    confidence_score: 0.7,
    routing_decision: "review_required",
    is_auto_approved: false,
    rework_count: 0,
  };

  function setupDefaultDeliveryMock() {
    mockDeliverApprovalRequest.mockResolvedValue({
      payload: {
        approveToken: "tok",
        rejectToken: "rtok",
        escalateToken: "etok",
        callbackUrl: "http://localhost/webhook/approval",
        expiresAt: Date.now() + 300_000,
        event: "approval_request",
        sessionId: "s",
        taskId: "t",
        task: {},
      },
      result: { ok: true, attempts: 1 },
    });
    mockDeliverWebhook.mockResolvedValue({ ok: true, attempts: 1 });
    mockDeliverTimeoutNotification.mockResolvedValue({ ok: true, attempts: 1 });
  }

  beforeEach(() => {
    resolvers.clear();
    mockDeliverApprovalRequest.mockReset();
    mockDeliverWebhook.mockReset();
    mockDeliverTimeoutNotification.mockReset();
    setupDefaultDeliveryMock();
  });

  it("auto-approves auto_approved tasks without delivery", async () => {
    const provider = createWebhookApprovalProvider(config);
    const decisions = await provider([autoTask]);

    expect(decisions.get("auto-1")?.action).toBe("approve");
    expect(mockDeliverApprovalRequest).not.toHaveBeenCalled();
  });

  it("delivers webhook for each manual-review task", async () => {
    const provider = createWebhookApprovalProvider(config);
    const promise = provider([manualTask]);

    // Wait for delivery and resolver setup
    await new Promise((r) => setTimeout(r, 50));

    const resolver = resolvers.get("manual-1");
    expect(resolver).toBeDefined();
    resolver!({ action: "approve" });

    const decisions = await promise;
    expect(decisions.get("manual-1")?.action).toBe("approve");
    expect(mockDeliverApprovalRequest).toHaveBeenCalledTimes(1);
  });

  it("times out and auto-escalates after timeoutSeconds", async () => {
    vi.useFakeTimers();

    const shortConfig = { ...config, timeoutSeconds: 1 };
    const provider = createWebhookApprovalProvider(shortConfig);
    const promise = provider([manualTask]);

    // Let the delivery resolve first
    await vi.advanceTimersByTimeAsync(100);

    // Advance past timeout
    await vi.advanceTimersByTimeAsync(1500);

    const decisions = await promise;
    expect(decisions.get("manual-1")?.action).toBe("escalate");

    vi.useRealTimers();
  });

  it("falls back to fallbackProvider on delivery failure", async () => {
    mockDeliverApprovalRequest.mockResolvedValue({
      payload: {} as never,
      result: { ok: false, error: "Connection refused", attempts: 3 },
    });

    const fallback = vi.fn().mockResolvedValue(
      new Map([["manual-1", { action: "approve" as const }]]),
    );

    const provider = createWebhookApprovalProvider(config, fallback);
    const decisions = await provider([manualTask]);

    expect(fallback).toHaveBeenCalledWith([manualTask]);
    expect(decisions.get("manual-1")?.action).toBe("approve");
  });

  it("auto-approves with warning when delivery fails and no fallback", async () => {
    mockDeliverApprovalRequest.mockResolvedValue({
      payload: {} as never,
      result: { ok: false, error: "Connection refused", attempts: 3 },
    });

    const provider = createWebhookApprovalProvider(config);
    const decisions = await provider([manualTask]);

    expect(decisions.get("manual-1")?.action).toBe("approve");
  });
});
