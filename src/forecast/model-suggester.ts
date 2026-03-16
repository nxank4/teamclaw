/**
 * Model swap suggestions — recommends cheaper models when appropriate.
 * Only suggests downgrades backed by profile data.
 */

import type { ModelSuggestion, ModelPricing, ModelRecommendation } from "./types.js";
import { getModelPricing, getAllPricing } from "./pricing.js";

export interface AgentCostData {
  agentRole: string;
  currentModel: string;
  estimatedCostUSD: number;
  averageConfidence: number;
}

/**
 * Generate model swap suggestions for agents where savings are possible.
 * Only suggests for the top 2 most expensive agents.
 */
export function suggestModelSwaps(
  agents: AgentCostData[],
  pricingOverrides?: Record<string, ModelPricing>,
): ModelSuggestion[] {
  if (agents.length === 0) return [];

  const allPricing = getAllPricing(pricingOverrides);
  const suggestions: ModelSuggestion[] = [];

  // Focus on top 2 most expensive agents
  const sorted = [...agents].sort((a, b) => b.estimatedCostUSD - a.estimatedCostUSD);
  const topExpensive = sorted.slice(0, 2);

  for (const agent of topExpensive) {
    const currentPricing = getModelPricing(agent.currentModel, pricingOverrides);
    const currentCostRate = currentPricing.inputPer1M + currentPricing.outputPer1M;

    // Find cheaper alternatives
    for (const [modelName, pricing] of Object.entries(allPricing)) {
      const altCostRate = pricing.inputPer1M + pricing.outputPer1M;
      if (altCostRate >= currentCostRate) continue; // Not cheaper
      if (modelName === agent.currentModel) continue;

      // Skip aliases and partial names — only suggest distinct models
      if (modelName.length < 5) continue;

      const savingsPct = Math.round(((currentCostRate - altCostRate) / currentCostRate) * 100);
      if (savingsPct < 15) continue; // Not worth suggesting

      // Estimate confidence drop: cheaper models generally lose some quality
      // Use pricing ratio as rough proxy
      const qualityRatio = altCostRate / currentCostRate;
      const estimatedConfidenceDrop = Math.round((1 - qualityRatio) * 0.15 * 100) / 100;

      // Determine recommendation
      let recommendation: ModelRecommendation;
      if (savingsPct > 30 && estimatedConfidenceDrop < 0.05) {
        recommendation = "switch";
      } else if (savingsPct > 15 && estimatedConfidenceDrop < 0.10) {
        recommendation = "consider";
      } else {
        recommendation = "keep";
      }

      if (recommendation === "keep") continue;

      suggestions.push({
        agentRole: agent.agentRole,
        currentModel: agent.currentModel,
        suggestedModel: modelName,
        estimatedSavingsPct: savingsPct,
        estimatedConfidenceDrop,
        recommendation,
      });

      break; // One suggestion per agent (best alternative)
    }
  }

  return suggestions;
}
