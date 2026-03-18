/**
 * Shared types and interfaces for the OpenClaw client.
 */

import { z } from "zod";
import { OpenClawError } from "./errors.js";
export { OpenClawError, type OpenClawErrorCode } from "./errors.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const OpenClawClientConfigSchema = z.object({
  /** WebSocket gateway URL (ws:// or wss://) */
  gatewayUrl: z.string().url(),
  /** Optional auth token for Bearer authentication */
  apiKey: z.string().optional(),
  /** Delay between reconnection attempts in ms (default 3000) */
  reconnectDelay: z.number().int().positive().optional().default(3000),
  /** Maximum reconnection attempts before giving up (default 5) */
  maxReconnectAttempts: z.number().int().min(0).optional().default(5),
  /** Per-request timeout in ms (default 30000) */
  timeout: z.number().int().positive().optional().default(30_000),
});

export type OpenClawClientConfig = z.infer<typeof OpenClawClientConfigSchema>;

// ---------------------------------------------------------------------------
// Streaming (re-exported from providers/stream-types for backward compat)
// ---------------------------------------------------------------------------

export type { StreamOptions, StreamChunk } from "../providers/stream-types.js";

// ---------------------------------------------------------------------------
// Lifecycle events
// ---------------------------------------------------------------------------

export interface OpenClawClientEvents {
  connected: [];
  disconnected: [reason: string];
  error: [error: OpenClawError];
  reconnecting: [attempt: number, maxAttempts: number];
}
