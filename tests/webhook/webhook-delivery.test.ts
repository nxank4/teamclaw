import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { deliverWebhook, buildApprovalPayload } from "@/webhook/delivery.js";
import { createTokenManager, computeHmacSignature } from "@/webhook/tokens.js";
import type { PartialApprovalTask } from "@/agents/partial-approval.js";
import type { WebhookApprovalConfig } from "@/webhook/types.js";

describe("webhook delivery", () => {
  const SECRET = "delivery-test-secret";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("deliverWebhook", () => {
    it("computes correct sha256 HMAC signature header", async () => {
      let capturedHeaders: Record<string, string> = {};
      vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, opts) => {
        capturedHeaders = Object.fromEntries(
          Object.entries((opts as RequestInit).headers as Record<string, string>),
        );
        return new Response("OK", { status: 200 });
      });

      const payload = { test: true };
      await deliverWebhook("https://example.com/hook", SECRET, payload, 1);

      const body = JSON.stringify(payload);
      const expected = `sha256=${computeHmacSignature(SECRET, body)}`;
      expect(capturedHeaders["X-Webhook-Signature"]).toBe(expected);
    });

    it("succeeds on first attempt with 200 response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("OK", { status: 200 }),
      );

      const result = await deliverWebhook("https://example.com", SECRET, { ok: 1 }, 3);
      expect(result.ok).toBe(true);
      expect(result.attempts).toBe(1);
      expect(result.statusCode).toBe(200);
    });

    it("retries on 500 and succeeds on second attempt", async () => {
      let callCount = 0;
      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response("Error", { status: 500 });
        }
        return new Response("OK", { status: 200 });
      });

      const result = await deliverWebhook("https://example.com", SECRET, { ok: 1 }, 3);
      expect(result.ok).toBe(true);
      expect(result.attempts).toBe(2);
    });

    it("returns failure after retries exhausted", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Error", { status: 500 }),
      );

      const result = await deliverWebhook("https://example.com", SECRET, { ok: 1 }, 2);
      expect(result.ok).toBe(false);
      expect(result.attempts).toBe(2);
    });

    it("does not retry on 4xx client errors", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Bad Request", { status: 400 }),
      );

      const result = await deliverWebhook("https://example.com", SECRET, { ok: 1 }, 3);
      expect(result.ok).toBe(false);
      expect(result.attempts).toBe(1);
      expect(result.statusCode).toBe(400);
    });
  });

  describe("buildApprovalPayload", () => {
    const config: WebhookApprovalConfig = {
      url: "https://hooks.example.com/approval",
      secret: SECRET,
      provider: "generic",
      timeoutSeconds: 300,
      retryAttempts: 3,
      callbackBaseUrl: "http://localhost:9001",
      sessionId: "sess-123",
    };

    const task: PartialApprovalTask = {
      task_id: "task-abc",
      description: "Build login page",
      assigned_to: "worker-1",
      confidence_score: 0.92,
      routing_decision: "auto_approve",
      is_auto_approved: false,
      rework_count: 0,
    };

    it("builds payload with all required fields", () => {
      const tm = createTokenManager(SECRET);
      const payload = buildApprovalPayload(config, task, tm);

      expect(payload.event).toBe("approval_request");
      expect(payload.sessionId).toBe("sess-123");
      expect(payload.taskId).toBe("task-abc");
      expect(payload.task.description).toBe("Build login page");
      expect(payload.task.assignedTo).toBe("worker-1");
      expect(payload.task.confidence).toBe(0.92);
      expect(payload.callbackUrl).toBe("http://localhost:9001/webhook/approval");
      expect(payload.expiresAt).toBeGreaterThan(Date.now());
    });

    it("generates valid tokens that can be verified", () => {
      const tm = createTokenManager(SECRET);
      const payload = buildApprovalPayload(config, task, tm);

      const approveResult = tm.verify(payload.approveToken);
      expect(approveResult?.action).toBe("approve");
      expect(approveResult?.taskId).toBe("task-abc");

      const rejectResult = tm.verify(payload.rejectToken);
      expect(rejectResult?.action).toBe("reject");

      const escalateResult = tm.verify(payload.escalateToken);
      expect(escalateResult?.action).toBe("escalate");
    });

    it("truncates result preview to 500 chars", () => {
      const longTask: PartialApprovalTask = {
        ...task,
        description: "A".repeat(1000),
      };
      const tm = createTokenManager(SECRET);
      const payload = buildApprovalPayload(config, longTask, tm);
      expect(payload.task.resultPreview.length).toBeLessThanOrEqual(500);
    });
  });
});
