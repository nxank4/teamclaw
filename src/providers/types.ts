import type { StreamChunk, StreamOptions } from "./stream-types.js";

export type ProviderName = "openclaw" | "anthropic";

export class ProviderError extends Error {
  readonly provider: ProviderName;
  readonly code: string;
  readonly statusCode?: number;
  readonly isFallbackTrigger: boolean;
  readonly cause?: unknown;

  constructor(opts: {
    provider: ProviderName;
    code: string;
    message: string;
    statusCode?: number;
    isFallbackTrigger: boolean;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = "ProviderError";
    this.provider = opts.provider;
    this.code = opts.code;
    this.statusCode = opts.statusCode;
    this.isFallbackTrigger = opts.isFallbackTrigger;
    this.cause = opts.cause;
  }
}

export type ProviderStats = {
  openclaw: { requests: number; failures: number };
  anthropic: { requests: number; failures: number };
  fallbacksTriggered: number;
};

export function emptyStats(): ProviderStats {
  return {
    openclaw: { requests: 0, failures: 0 },
    anthropic: { requests: 0, failures: 0 },
    fallbacksTriggered: 0,
  };
}
