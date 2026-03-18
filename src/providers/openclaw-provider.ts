import { OpenClawClient } from "../client/OpenClawClient.js";
import { OpenClawError } from "../client/errors.js";
import type { OpenClawClientConfig } from "../client/types.js";
import type { StreamChunk, StreamOptions } from "./stream-types.js";
import type { StreamProvider } from "./provider.js";
import { ProviderError } from "./types.js";

const DEFAULT_FIRST_CHUNK_TIMEOUT_MS = 15_000;

function isFallbackTrigger(err: OpenClawError): boolean {
  if (err.code === "CONNECTION_FAILED") return true;
  if (err.code === "TIMEOUT") return true;
  if (err.code === "STREAM_FAILED") {
    const status = err.statusCode;
    if (status === 429) return true;
    if (status && status >= 500) return true;
  }
  return false;
}

export class OpenClawProvider implements StreamProvider {
  readonly name = "openclaw";
  private readonly client: OpenClawClient;
  private readonly gatewayHealthUrl: string;
  private readonly firstChunkTimeoutMs: number;
  private available = true;

  constructor(config: OpenClawClientConfig, opts?: { firstChunkTimeoutMs?: number; healthUrl?: string }) {
    this.client = new OpenClawClient(config);
    this.firstChunkTimeoutMs = opts?.firstChunkTimeoutMs ?? DEFAULT_FIRST_CHUNK_TIMEOUT_MS;
    // Derive HTTP health URL from WS URL (same pattern as OpenClawClient.wsToHttpBase)
    const wsUrl = config.gatewayUrl;
    const httpBase = wsUrl.replace(/^ws/, "http").replace(/:(\d+)$/, (_, p) => `:${Number(p) + 2}`);
    this.gatewayHealthUrl = opts?.healthUrl ?? `${httpBase}/health`;
  }

  async *stream(prompt: string, options?: StreamOptions): AsyncGenerator<StreamChunk, void, undefined> {
    // Ensure WebSocket connection
    if (!this.client.isConnected()) {
      try {
        await this.client.connect();
      } catch (err) {
        const ocErr = err instanceof OpenClawError ? err : new OpenClawError("CONNECTION_FAILED", String(err), err);
        throw new ProviderError({
          provider: "openclaw",
          code: ocErr.code,
          message: ocErr.message,
          statusCode: ocErr.statusCode,
          isFallbackTrigger: true,
          cause: ocErr,
        });
      }
    }

    // First-chunk timeout via derived AbortController
    const derivedController = new AbortController();
    const timer = setTimeout(() => derivedController.abort(), this.firstChunkTimeoutMs);

    // Chain caller's signal if present
    if (options?.signal) {
      if (options.signal.aborted) {
        clearTimeout(timer);
        throw new ProviderError({
          provider: "openclaw",
          code: "ABORTED",
          message: "Aborted before request",
          isFallbackTrigger: false,
        });
      }
      options.signal.addEventListener("abort", () => derivedController.abort(), { once: true });
    }

    const streamOpts: StreamOptions = { ...options, signal: derivedController.signal };

    try {
      let firstChunkReceived = false;
      for await (const chunk of this.client.stream(prompt, streamOpts)) {
        if (!firstChunkReceived) {
          clearTimeout(timer);
          firstChunkReceived = true;
        }
        yield chunk;
      }
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof ProviderError) throw err;

      const ocErr = err instanceof OpenClawError
        ? err
        : new OpenClawError("STREAM_FAILED", String(err), err);

      // Check if abort was from our first-chunk timer.
      // When the timer fires, derivedController.abort() is called. This causes
      // either a DOMException("AbortError") from fetch, or a read error from
      // the SSE body reader. Both get caught here. We detect our timer's abort
      // by checking derivedController.signal.aborted — regardless of error code.
      if (derivedController.signal.aborted) {
        throw new ProviderError({
          provider: "openclaw",
          code: "FIRST_CHUNK_TIMEOUT",
          message: `No response within ${this.firstChunkTimeoutMs}ms`,
          isFallbackTrigger: true,
          cause: err,
        });
      }

      throw new ProviderError({
        provider: "openclaw",
        code: ocErr.code,
        message: ocErr.message,
        statusCode: ocErr.statusCode,
        isFallbackTrigger: isFallbackTrigger(ocErr),
        cause: ocErr,
      });
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(this.gatewayHealthUrl, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  setAvailable(available: boolean): void {
    this.available = available;
  }

  getClient(): OpenClawClient {
    return this.client;
  }
}
