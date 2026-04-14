import type { StreamChunk, StreamOptions } from "./stream-types.js";
import type { StreamProvider } from "./provider.js";
import { ProviderError, type ProviderStatEntry, type ProviderStats, emptyStats } from "./types.js";
import { logger } from "../core/logger.js";

/**
 * Maps model name prefixes to the provider name that serves them.
 * Used to route requests to the correct provider when the user
 * sets a specific model (e.g. gpt-4o should go to openai, not anthropic).
 */
/**
 * Maps model name prefixes to provider names that can serve them.
 * Multiple provider names per prefix allows matching copilot/chatgpt
 * which also serve GPT models.
 */
const MODEL_PROVIDER_PREFIXES: [string[], string[]][] = [
  [["anthropic"], ["claude-"]],
  [["openai", "copilot", "chatgpt"], ["gpt-", "o1-", "o3-", "o4-", "chatgpt-"]],
  [["deepseek"], ["deepseek-"]],
  [["gemini"], ["gemini-"]],
  [["grok"], ["grok-"]],
  [["mistral"], ["mistral-", "codestral", "pixtral", "ministral"]],
  [["groq"], ["llama-", "llama3", "mixtral"]],
  [["cohere"], ["command-"]],
];

/**
 * Return the set of provider names that can serve a given model, or null.
 */
function matchModelToProviders(model: string): Set<string> | null {
  const lower = model.toLowerCase();
  for (const [providers, prefixes] of MODEL_PROVIDER_PREFIXES) {
    for (const prefix of prefixes) {
      if (lower.startsWith(prefix)) return new Set(providers);
    }
  }
  return null;
}

export class ProviderManager {
  private readonly providers: StreamProvider[];
  private stats: ProviderStats = emptyStats();

  constructor(providers: StreamProvider[]) {
    this.providers = providers;
  }

  private getStatEntry(name: string): ProviderStatEntry {
    let entry = this.stats[name] as ProviderStatEntry | undefined;
    if (!entry || typeof entry === "number") {
      entry = { requests: 0, failures: 0 };
      this.stats[name] = entry;
    }
    return entry;
  }

  /**
   * Order providers so those matching the requested model come first.
   * Falls back to the original chain order if no match is found.
   */
  private orderForModel(model?: string): StreamProvider[] {
    if (!model) return this.providers;

    const targets = matchModelToProviders(model);
    if (!targets) return this.providers;

    // Split into matching and non-matching, preserving relative order
    const matching: StreamProvider[] = [];
    const rest: StreamProvider[] = [];
    for (const p of this.providers) {
      if (targets.has(p.name)) {
        matching.push(p);
      } else {
        rest.push(p);
      }
    }

    if (matching.length === 0 || matching[0] === this.providers[0]) {
      return this.providers; // already optimal or no match
    }

    const reordered = [...matching, ...rest];
    logger.debug(`[providers] reordered chain: ${reordered.map((p) => p.name).join(" -> ")} (model=${model})`);
    return reordered;
  }

  async *stream(
    prompt: string,
    options?: StreamOptions,
  ): AsyncGenerator<StreamChunk, void, undefined> {
    const errors: ProviderError[] = [];
    const ordered = this.orderForModel(options?.model);

    for (let i = 0; i < ordered.length; i++) {
      const provider = ordered[i]!;

      if (!provider.isAvailable()) {
        logger.debug(`[providers] skipping ${provider.name} (unavailable)`);
        continue;
      }

      const statEntry = this.getStatEntry(provider.name);
      statEntry.requests++;

      try {
        yield* provider.stream(prompt, options);
        return;
      } catch (err) {
        statEntry.failures++;

        const providerErr = err instanceof ProviderError
          ? err
          : new ProviderError({
              provider: provider.name,
              code: "UNKNOWN",
              message: String(err),
              isFallbackTrigger: false,
              cause: err,
            });

        if (!providerErr.isFallbackTrigger) {
          throw providerErr;
        }

        errors.push(providerErr);

        const next = ordered[i + 1];
        if (next) {
          (this.stats.fallbacksTriggered as number)++;
          logger.warn(`${provider.name} unavailable — switching to ${next.name}`);
        }
      }
    }

    throw new ProviderError({
      provider: ordered[ordered.length - 1]?.name ?? "unknown",
      code: "ALL_PROVIDERS_FAILED",
      message: `ALL_PROVIDERS_FAILED: ${errors.map((e) => `${e.provider}: ${e.message}`).join("; ")}`,
      isFallbackTrigger: false,
    });
  }

  /** Consume stream and return full text + usage. */
  async generate(
    prompt: string,
    options?: StreamOptions,
  ): Promise<{ text: string; usage?: { promptTokens: number; completionTokens: number } }> {
    const chunks: string[] = [];
    let usage: { promptTokens: number; completionTokens: number } | undefined;

    for await (const chunk of this.stream(prompt, options)) {
      chunks.push(chunk.content);
      if (chunk.done && chunk.usage) {
        usage = chunk.usage;
      }
    }

    return { text: chunks.join(""), usage };
  }

  getStats(): ProviderStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = emptyStats();
  }

  getProviders(): readonly StreamProvider[] {
    return this.providers;
  }
}
