/**
 * Model discovery — aggregates available models across all configured providers.
 * Uses fetchModelsForProvider() for live discovery, falls back to provider catalog.
 */
import { getGlobalProviderManager } from "./provider-factory.js";
import { fetchModelsForProvider, fetchOllamaModels } from "./model-fetcher.js";
import { getConfigValue } from "../core/configManager.js";

export interface DiscoveredModel {
  provider: string;
  model: string;
  displayName: string;
  status: "available" | "configured" | "not_configured" | "offline";
  contextWindow?: number;
}

export interface DiscoveryResult {
  models: DiscoveredModel[];
  providers: ProviderStatus[];
}

export interface ProviderStatus {
  id: string;
  name: string;
  status: "connected" | "configured" | "not_configured" | "offline";
  modelCount: number;
}

let cache: { result: DiscoveryResult; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Discover all available models across configured providers.
 * Results are cached for 5 minutes.
 */
export async function discoverModels(forceRefresh = false): Promise<DiscoveryResult> {
  if (cache && !forceRefresh && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.result;
  }

  const models: DiscoveredModel[] = [];
  const providers: ProviderStatus[] = [];

  // 1. Check configured providers from ProviderManager
  const mgr = getGlobalProviderManager();
  const configuredProviders = mgr.getProviders();

  for (const provider of configuredProviders) {
    const providerId = provider.name.toLowerCase();
    let isHealthy = false;

    try {
      isHealthy = await provider.healthCheck();
    } catch {
      // Health check failed
    }

    if (isHealthy) {
      // Provider is connected — try to discover models
      const apiKey = resolveApiKey(providerId);
      const fetchResult = await fetchModelsForProvider(providerId, apiKey);

      if (fetchResult.models.length > 0) {
        for (const m of fetchResult.models) {
          models.push({
            provider: providerId,
            model: m.id,
            displayName: m.name || m.id,
            status: "available",
            contextWindow: m.contextLength,
          });
        }
        providers.push({ id: providerId, name: provider.name, status: "connected", modelCount: fetchResult.models.length });
      } else {
        // Connected but no models discovered — mark as configured
        providers.push({ id: providerId, name: provider.name, status: "configured", modelCount: 0 });
      }
    } else {
      providers.push({ id: providerId, name: provider.name, status: "offline", modelCount: 0 });
    }
  }

  // 2. Always probe Ollama (local, no API key needed)
  if (!providers.some((p) => p.id === "ollama")) {
    const ollamaResult = await fetchOllamaModels();
    if (ollamaResult.models.length > 0) {
      for (const m of ollamaResult.models) {
        models.push({
          provider: "ollama",
          model: m.id,
          displayName: m.name || m.id,
          status: "available",
        });
      }
      providers.push({ id: "ollama", name: "Ollama", status: "connected", modelCount: ollamaResult.models.length });
    }
  }

  // 3. Always probe LM Studio (local, no API key)
  if (!providers.some((p) => p.id === "lmstudio")) {
    try {
      const lmsResult = await fetchModelsForProvider("lmstudio", "lm-studio");
      if (lmsResult.models.length > 0) {
        for (const m of lmsResult.models) {
          models.push({
            provider: "lmstudio",
            model: m.id,
            displayName: m.name || m.id,
            status: "available",
          });
        }
        providers.push({ id: "lmstudio", name: "LM Studio", status: "connected", modelCount: lmsResult.models.length });
      }
    } catch {
      // LM Studio not running
    }
  }

  const result: DiscoveryResult = { models, providers };
  cache = { result, timestamp: Date.now() };
  return result;
}

/** Invalidate discovery cache. */
export function invalidateModelCache(): void {
  cache = null;
}

/** Get the current model from config. */
export function getCurrentModel(): string {
  const result = getConfigValue("model", { raw: true });
  return (result.value as string) ?? "";
}

/** Find a model by fuzzy name match. */
export function findModel(query: string, models: DiscoveredModel[]): DiscoveredModel | undefined {
  const lower = query.toLowerCase();

  // Exact match
  const exact = models.find((m) => m.model.toLowerCase() === lower);
  if (exact) return exact;

  // Prefix match (e.g., "llama3" matches "llama3.1:latest")
  const prefix = models.find((m) => m.model.toLowerCase().startsWith(lower));
  if (prefix) return prefix;

  // Substring match (e.g., "sonnet" matches "claude-sonnet-4-20250514")
  const substring = models.find((m) =>
    m.model.toLowerCase().includes(lower) ||
    m.displayName.toLowerCase().includes(lower),
  );
  return substring;
}

function resolveApiKey(providerId: string): string {
  // Check config first
  const configKey = getConfigValue("apikey", { raw: true });
  if (configKey.value) return configKey.value as string;

  // Check env vars
  const envMap: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    groq: "GROQ_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    gemini: "GOOGLE_API_KEY",
  };
  const envKey = envMap[providerId];
  if (envKey && process.env[envKey]) return process.env[envKey]!;

  return "";
}
