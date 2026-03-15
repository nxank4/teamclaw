import { OpenClawClient } from "../client/OpenClawClient.js";
import { OpenClawError } from "../client/errors.js";
import type {
  OpenClawClientConfig,
  StreamChunk,
  StreamOptions,
} from "../client/types.js";
import type { ProxyHealthResponse, ProxyReconnectResponse } from "./types.js";

export class ProxyService {
  private readonly client: OpenClawClient;
  private readonly gatewayUrl: string;
  private readonly startTime: number;

  constructor(config: OpenClawClientConfig) {
    this.client = new OpenClawClient(config);
    this.gatewayUrl = config.gatewayUrl;
    this.startTime = Date.now();
  }

  async ensureConnected(): Promise<void> {
    if (!this.client.isConnected()) {
      try {
        await this.client.connect();
      } catch (err) {
        if (err instanceof OpenClawError) throw err;
        throw new OpenClawError(
          "CONNECTION_FAILED",
          `Failed to connect: ${String(err)}`,
          err,
        );
      }
    }
  }

  async *stream(
    prompt: string,
    options?: StreamOptions,
  ): AsyncGenerator<StreamChunk, void, undefined> {
    await this.ensureConnected();
    yield* this.client.stream(prompt, options);
  }

  health(): ProxyHealthResponse {
    return {
      connected: this.client.isConnected(),
      gatewayUrl: this.gatewayUrl,
      uptime: Date.now() - this.startTime,
    };
  }

  async reconnect(): Promise<ProxyReconnectResponse> {
    await this.client.disconnect();
    await this.client.connect();
    return { success: true, message: "Reconnected successfully" };
  }

  async shutdown(): Promise<void> {
    await this.client.disconnect();
  }
}

let instance: ProxyService | null = null;

export function createProxyService(config: OpenClawClientConfig): ProxyService {
  if (!instance) {
    instance = new ProxyService(config);
  }
  return instance;
}
