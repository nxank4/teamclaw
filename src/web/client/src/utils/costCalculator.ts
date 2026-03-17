import { priceRegistry } from "./PriceRegistry";

const MICRO_MULTIPLIER = 1_000_000; // Use micro-USD to avoid floating-point errors

export async function initPriceRegistry(): Promise<void> {
  await priceRegistry.init();
}

export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens: number,
  model: string
): number {
  const pricing = priceRegistry.getPricing(model);
  const cachedPricing = priceRegistry.getCachedPricing(model);

  // Calculate full-price input tokens (total - cached)
  const fullPriceInputTokens = Math.max(0, inputTokens - cachedInputTokens);

  // Use micro-USD for precision: (tokens / 1M) * price * 1M
  const inputMicro = Math.round((fullPriceInputTokens / 1_000_000) * pricing.inputPerM * MICRO_MULTIPLIER);
  const cachedMicro = Math.round((cachedInputTokens / 1_000_000) * cachedPricing.cachedPerM! * MICRO_MULTIPLIER);
  const outputMicro = Math.round((outputTokens / 1_000_000) * pricing.outputPerM * MICRO_MULTIPLIER);

  // Convert back from micro-USD to regular USD
  const totalMicro = inputMicro + cachedMicro + outputMicro;
  return totalMicro / MICRO_MULTIPLIER;
}

export function formatCurrency(usd: number): string {
  return `🪙 $${usd.toFixed(4)}`;
}
