import type { StreamChunk, StreamOptions } from "./stream-types.js";
import type { StreamProvider } from "./provider.js";
import { ProviderError, type ProviderStatEntry, type ProviderStats, emptyStats } from "./types.js";
import { logger } from "../core/logger.js";

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

  async *stream(
    prompt: string,
    options?: StreamOptions,
  ): AsyncGenerator<StreamChunk, void, undefined> {
    const errors: ProviderError[] = [];

    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i]!;

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

        const next = this.providers[i + 1];
        if (next) {
          (this.stats.fallbacksTriggered as number)++;
          logger.warn(`${provider.name} unavailable — switching to ${next.name}`);
        }
      }
    }

    throw new ProviderError({
      provider: this.providers[this.providers.length - 1]?.name ?? "unknown",
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
