/**
 * HMAC-SHA256 token signing, verification, and one-time-use tracking.
 * No external dependencies — uses Node crypto.
 */

import { createHmac } from "node:crypto";
import type { WebhookTokenPayload } from "./types.js";

export function computeHmacSignature(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function base64urlEncode(data: string): string {
  return Buffer.from(data, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(encoded: string): string {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf-8");
}

export interface TokenManager {
  sign(payload: WebhookTokenPayload): string;
  verify(token: string): WebhookTokenPayload | null;
  consume(token: string): WebhookTokenPayload | null;
}

export function createTokenManager(secret: string): TokenManager {
  const consumed = new Map<string, number>(); // signature → expiresAt

  function pruneExpired(): void {
    const now = Date.now();
    for (const [sig, exp] of consumed) {
      if (exp < now) consumed.delete(sig);
    }
  }

  function sign(payload: WebhookTokenPayload): string {
    const encoded = base64urlEncode(JSON.stringify(payload));
    const signature = computeHmacSignature(secret, encoded);
    return `${encoded}.${signature}`;
  }

  function verify(token: string): WebhookTokenPayload | null {
    const dotIndex = token.indexOf(".");
    if (dotIndex < 0) return null;

    const encoded = token.slice(0, dotIndex);
    const signature = token.slice(dotIndex + 1);

    const expected = computeHmacSignature(secret, encoded);
    if (signature !== expected) return null;

    try {
      const payload = JSON.parse(base64urlDecode(encoded)) as WebhookTokenPayload;
      if (payload.expiresAt < Date.now()) return null;
      return payload;
    } catch {
      return null;
    }
  }

  function consume(token: string): WebhookTokenPayload | null {
    pruneExpired();

    const dotIndex = token.indexOf(".");
    if (dotIndex < 0) return null;
    const signature = token.slice(dotIndex + 1);

    if (consumed.has(signature)) return null;

    const payload = verify(token);
    if (!payload) return null;

    consumed.set(signature, payload.expiresAt);
    return payload;
  }

  return { sign, verify, consume };
}
