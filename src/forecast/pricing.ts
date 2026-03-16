/**
 * Model pricing table — configurable via ~/.teamclaw/config.json.
 */

import type { ModelPricing } from "./types.js";

/** Built-in model pricing (USD per 1M tokens). */
const DEFAULT_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-6": { inputPer1M: 15.00, outputPer1M: 75.00 },
  "claude-sonnet-4-6": { inputPer1M: 3.00, outputPer1M: 15.00 },
  "claude-haiku-4-5-20251001": { inputPer1M: 0.80, outputPer1M: 4.00 },
  // Aliases
  "opus": { inputPer1M: 15.00, outputPer1M: 75.00 },
  "sonnet": { inputPer1M: 3.00, outputPer1M: 15.00 },
  "haiku": { inputPer1M: 0.80, outputPer1M: 4.00 },
  // OpenAI models
  "gpt-4o": { inputPer1M: 2.50, outputPer1M: 10.00 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.60 },
  "gpt-4-turbo": { inputPer1M: 10.00, outputPer1M: 30.00 },
};

/** Get pricing for a model, checking config overrides first. */
export function getModelPricing(
  model: string,
  configOverrides?: Record<string, ModelPricing>,
): ModelPricing {
  // Config overrides take priority
  if (configOverrides?.[model]) return configOverrides[model];

  // Check built-in by exact match
  if (DEFAULT_PRICING[model]) return DEFAULT_PRICING[model];

  // Partial match (e.g. "claude-sonnet" matches "claude-sonnet-4-6")
  for (const [key, pricing] of Object.entries(DEFAULT_PRICING)) {
    if (model.includes(key) || key.includes(model)) return pricing;
  }

  // Default: assume mid-range
  return { inputPer1M: 3.00, outputPer1M: 15.00 };
}

/** Compute cost for a token count given pricing. */
export function computeTokenCost(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing,
): number {
  return (inputTokens * pricing.inputPer1M + outputTokens * pricing.outputPer1M) / 1_000_000;
}

/** Get all available model pricings (built-in + overrides). */
export function getAllPricing(
  configOverrides?: Record<string, ModelPricing>,
): Record<string, ModelPricing> {
  return { ...DEFAULT_PRICING, ...(configOverrides ?? {}) };
}
