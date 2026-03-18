import type { OpenClawClientConfig } from "../client/types.js";
import type { StreamChunk, StreamOptions } from "../providers/stream-types.js";
import type { ProxyHealthResponse, ProxyReconnectResponse } from "./types.js";
import { isMockLlmEnabled, generateMockResponse } from "../core/mock-llm.js";
import { streamWithCache } from "../cache/cache-interceptor.js";
import { ProviderManager, OpenClawProvider, AnthropicProvider, HealthMonitor } from "../providers/index.js";
import type { StreamProvider } from "../providers/index.js";
import { readGlobalConfig } from "../core/global-config.js";

export class ProxyService {
  readonly providerManager: ProviderManager;
  readonly healthMonitor: HealthMonitor;
  private readonly gatewayUrl: string;
  private readonly startTime: number;

  constructor(providerManager: ProviderManager, healthMonitor: HealthMonitor, gatewayUrl: string) {
    this.providerManager = providerManager;
    this.healthMonitor = healthMonitor;
    this.gatewayUrl = gatewayUrl;
    this.startTime = Date.now();
  }

  async *stream(
    prompt: string,
    options?: StreamOptions & { agentRole?: string },
  ): AsyncGenerator<StreamChunk, void, undefined> {
    if (isMockLlmEnabled()) {
      const mockText = generateMockResponse(prompt, "proxy");
      yield { content: mockText, done: false };
      yield { content: "", done: true };
      return;
    }

    const model = options?.model ?? "default";
    const agentRole = options?.agentRole ?? "default";
    const rawStream = this.providerManager.stream(prompt, options);
    yield* streamWithCache(prompt, model, agentRole, rawStream);
  }

  health(): ProxyHealthResponse {
    return {
      connected: true,
      gatewayUrl: this.gatewayUrl,
      uptime: Date.now() - this.startTime,
    };
  }

  async reconnect(): Promise<ProxyReconnectResponse> {
    this.healthMonitor.resetAll();
    return { success: true, message: "Provider health state reset" };
  }

  async shutdown(): Promise<void> {
    this.healthMonitor.stop();
  }
}

let instance: ProxyService | null = null;

/** Get the singleton's ProviderManager (for stats access from audit/work-runner). Returns null if not yet created. */
export function getProviderManager(): ProviderManager | null {
  return instance?.providerManager ?? null;
}

/** Get the singleton's HealthMonitor. Returns null if not yet created. */
export function getHealthMonitor(): HealthMonitor | null {
  return instance?.healthMonitor ?? null;
}

export function createProxyService(config: OpenClawClientConfig): ProxyService {
  if (!instance) {
    const openclawProvider = new OpenClawProvider(config, {
      firstChunkTimeoutMs: getFirstChunkTimeout(),
    });

    const providers: StreamProvider[] = [openclawProvider];

    // Add Anthropic fallback if configured
    const anthropicConfig = getAnthropicConfig();
    if (anthropicConfig) {
      providers.push(new AnthropicProvider(anthropicConfig));
    }

    const manager = new ProviderManager(providers);
    const monitor = new HealthMonitor(providers);

    instance = new ProxyService(manager, monitor, config.gatewayUrl);
  }
  return instance;
}

function getFirstChunkTimeout(): number {
  try {
    const cfg = readGlobalConfig();
    const providers = (cfg as Record<string, unknown> | null)?.providers as Record<string, unknown> | undefined;
    return (providers?.firstChunkTimeoutMs as number) ?? 15_000;
  } catch {
    return 15_000;
  }
}

function getAnthropicConfig(): { apiKey?: string; model?: string } | null {
  if (process.env.ANTHROPIC_API_KEY) {
    return { apiKey: process.env.ANTHROPIC_API_KEY };
  }
  try {
    const cfg = readGlobalConfig();
    const providers = (cfg as Record<string, unknown> | null)?.providers as Record<string, unknown> | undefined;
    const anthropic = providers?.anthropic as Record<string, unknown> | undefined;
    if (anthropic?.apiKey) {
      return { apiKey: anthropic.apiKey as string, model: anthropic.model as string | undefined };
    }
  } catch {
    // No config
  }
  return null;
}
