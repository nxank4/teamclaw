import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTokenManager, computeHmacSignature } from "@/webhook/tokens.js";
import type { WebhookTokenPayload } from "@/webhook/types.js";

describe("webhook tokens", () => {
  const SECRET = "test-secret-key-abc123";

  describe("computeHmacSignature", () => {
    it("produces a hex HMAC-SHA256 digest", () => {
      const sig = computeHmacSignature(SECRET, '{"test":true}');
      expect(sig).toMatch(/^[a-f0-9]{64}$/);
    });

    it("changes when body changes", () => {
      const a = computeHmacSignature(SECRET, "a");
      const b = computeHmacSignature(SECRET, "b");
      expect(a).not.toBe(b);
    });
  });

  describe("createTokenManager", () => {
    let tm: ReturnType<typeof createTokenManager>;
    const payload: WebhookTokenPayload = {
      taskId: "task-1",
      action: "approve",
      sessionId: "sess-1",
      expiresAt: Date.now() + 60_000,
    };

    beforeEach(() => {
      tm = createTokenManager(SECRET);
    });

    it("signs and verifies a valid token roundtrip", () => {
      const token = tm.sign(payload);
      const result = tm.verify(token);
      expect(result).toEqual(payload);
    });

    it("rejects token with wrong secret (tampered)", () => {
      const token = tm.sign(payload);
      const otherTm = createTokenManager("wrong-secret");
      expect(otherTm.verify(token)).toBeNull();
    });

    it("rejects expired token", () => {
      const expired: WebhookTokenPayload = {
        ...payload,
        expiresAt: Date.now() - 1000,
      };
      const token = tm.sign(expired);
      expect(tm.verify(token)).toBeNull();
    });

    it("rejects already-consumed token", () => {
      const token = tm.sign(payload);
      const first = tm.consume(token);
      expect(first).toEqual(payload);

      const second = tm.consume(token);
      expect(second).toBeNull();
    });

    it("rejects malformed token (no dot)", () => {
      expect(tm.verify("no-dot-here")).toBeNull();
    });

    it("rejects token with invalid base64 payload", () => {
      const token = "not-valid-base64.abcd1234";
      expect(tm.verify(token)).toBeNull();
    });

    it("prunes expired entries from consumed set on consume()", () => {
      // Consume a token that expires soon
      const shortLived: WebhookTokenPayload = {
        ...payload,
        expiresAt: Date.now() + 100,
      };
      const token = tm.sign(shortLived);
      tm.consume(token);

      // Wait for expiry, then consume another — the first should be pruned
      vi.useFakeTimers();
      vi.advanceTimersByTime(200);

      const freshPayload: WebhookTokenPayload = {
        ...payload,
        taskId: "task-2",
        expiresAt: Date.now() + 60_000,
      };
      const fresh = tm.sign(freshPayload);
      const result = tm.consume(fresh);
      expect(result).not.toBeNull();

      vi.useRealTimers();
    });

    it("token format is payload.signature", () => {
      const token = tm.sign(payload);
      const parts = token.split(".");
      expect(parts.length).toBe(2);
      // Signature is hex
      expect(parts[1]).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
