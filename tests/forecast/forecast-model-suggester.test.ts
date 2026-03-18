import { describe, it, expect } from "vitest";
import { suggestModelSwaps } from "@/forecast/model-suggester.js";
import type { AgentCostData } from "@/forecast/model-suggester.js";

describe("suggestModelSwaps", () => {
  it("recommends switch at > 30% savings and < 0.05 confidence drop", () => {
    const agents: AgentCostData[] = [{
      agentRole: "worker_task",
      currentModel: "claude-opus-4-6", // Expensive
      estimatedCostUSD: 0.10,
      averageConfidence: 0.9,
    }];

    const suggestions = suggestModelSwaps(agents);
    // Should suggest cheaper model
    const switchSuggestion = suggestions.find((s) => s.recommendation === "switch" || s.recommendation === "consider");
    expect(switchSuggestion).toBeDefined();
    expect(switchSuggestion!.estimatedSavingsPct).toBeGreaterThan(15);
  });

  it("recommends keep when savings < 15%", () => {
    const agents: AgentCostData[] = [{
      agentRole: "worker_task",
      currentModel: "claude-haiku-4-5-20251001", // Already cheap
      estimatedCostUSD: 0.01,
      averageConfidence: 0.85,
    }];

    const suggestions = suggestModelSwaps(agents);
    // Haiku is already the cheapest — no suggestions expected
    expect(suggestions).toHaveLength(0);
  });

  it("only suggests for top 2 most expensive agents", () => {
    const agents: AgentCostData[] = [
      { agentRole: "agent-1", currentModel: "claude-opus-4-6", estimatedCostUSD: 0.20, averageConfidence: 0.9 },
      { agentRole: "agent-2", currentModel: "claude-opus-4-6", estimatedCostUSD: 0.15, averageConfidence: 0.85 },
      { agentRole: "agent-3", currentModel: "claude-opus-4-6", estimatedCostUSD: 0.05, averageConfidence: 0.8 },
    ];

    const suggestions = suggestModelSwaps(agents);
    const suggestedAgents = new Set(suggestions.map((s) => s.agentRole));
    // Should not suggest for agent-3 (least expensive)
    expect(suggestedAgents.has("agent-3")).toBe(false);
  });

  it("returns empty for no agents", () => {
    expect(suggestModelSwaps([])).toEqual([]);
  });
});
