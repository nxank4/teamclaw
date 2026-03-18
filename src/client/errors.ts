/**
 * Error types for the OpenClaw client.
 */

export type OpenClawErrorCode =
  | "CONNECTION_FAILED"
  | "HANDSHAKE_REJECTED"
  | "STREAM_FAILED"
  | "TIMEOUT"
  | "DISCONNECTED"
  | "CONFIG_INVALID";

export class OpenClawError extends Error {
  readonly code: OpenClawErrorCode;
  readonly statusCode?: number;
  readonly cause?: unknown;

  constructor(code: OpenClawErrorCode, message: string, cause?: unknown, statusCode?: number) {
    super(message);
    this.name = "OpenClawError";
    this.code = code;
    this.cause = cause;
    this.statusCode = statusCode;
  }
}
