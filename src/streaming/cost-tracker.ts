/**
 * Real-time token and cost tracking per session.
 */

import { EventEmitter } from "node:events";
import type { CostSummary, CostUpdateEvent } from "./types.js";

// Approximate pricing per 1M tokens (USD)
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-sonnet-4": { input: 3.0, output: 15.0 },
  "claude-opus-4-6": { input: 15.0, output: 75.0 },
  "claude-opus-4": { input: 15.0, output: 75.0 },
  "claude-haiku-4-5": { input: 0.25, output: 1.25 },
  "claude-haiku-4": { input: 0.25, output: 1.25 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "o3-mini": { input: 1.1, output: 4.4 },
  "deepseek-chat": { input: 0.14, output: 0.28 },
  "deepseek-reasoner": { input: 0.55, output: 2.19 },
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
  "mixtral-8x7b-32768": { input: 0.24, output: 0.24 },
};

const FALLBACK_PRICING = { input: 1.0, output: 3.0 };

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = findPricing(model);
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

function findPricing(model: string): { input: number; output: number } {
  // Exact match
  if (PRICING[model]) return PRICING[model];

  // Partial match (strip date suffixes)
  const base = model.replace(/-\d{4,}.*$/, "");
  if (PRICING[base]) return PRICING[base];

  // Pattern match
  for (const [key, price] of Object.entries(PRICING)) {
    if (model.includes(key) || key.includes(model)) return price;
  }

  return FALLBACK_PRICING;
}

export class CostTracker extends EventEmitter {
  private sessions = new Map<string, CostSummary>();

  recordUsage(
    sessionId: string,
    agentId: string,
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): void {
    const summary = this.getOrCreate(sessionId);
    const costUSD = calculateCost(model, inputTokens, outputTokens);

    summary.totalInputTokens += inputTokens;
    summary.totalOutputTokens += outputTokens;
    summary.totalCostUSD += costUSD;

    // By provider
    const prov = summary.byProvider[provider] ?? { tokens: 0, costUSD: 0 };
    prov.tokens += inputTokens + outputTokens;
    prov.costUSD += costUSD;
    summary.byProvider[provider] = prov;

    // By agent
    const agent = summary.byAgent[agentId] ?? { tokens: 0, costUSD: 0 };
    agent.tokens += inputTokens + outputTokens;
    agent.costUSD += costUSD;
    summary.byAgent[agentId] = agent;

    // Emit cost update event
    const event: CostUpdateEvent = {
      type: "cost:update",
      sessionId,
      totalInputTokens: summary.totalInputTokens,
      totalOutputTokens: summary.totalOutputTokens,
      totalCostUSD: summary.totalCostUSD,
      timestamp: Date.now(),
    };
    this.emit("cost:update", event);
  }

  getSessionCost(sessionId: string): CostSummary {
    return this.getOrCreate(sessionId);
  }

  resetSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private getOrCreate(sessionId: string): CostSummary {
    let s = this.sessions.get(sessionId);
    if (!s) {
      s = { totalInputTokens: 0, totalOutputTokens: 0, totalCostUSD: 0, byProvider: {}, byAgent: {} };
      this.sessions.set(sessionId, s);
    }
    return s;
  }
}
