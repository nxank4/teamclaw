/**
 * Multi-factor scoring — merges activation, similarity, strength, and importance.
 * Ported from hebbmem: weighted sum of signals.
 */

import type { MemoryNode, MemoryResult, ScoringWeights } from "./types.js";

/**
 * Score a set of nodes using the weighted formula:
 *   score = w.activation * activation
 *         + w.similarity * similarity
 *         + w.strength * strength
 *         + w.importance * importance
 *
 * @param nodes - Nodes to score
 * @param similarityMap - Map of nodeId → LanceDB cosine similarity score (0-1)
 * @param weights - Scoring weights
 * @param topK - Number of results to return
 */
export function scoreNodes(
  nodes: MemoryNode[],
  similarityMap: Map<string, number>,
  weights: ScoringWeights,
  topK: number,
): MemoryResult[] {
  const results: MemoryResult[] = [];

  for (const node of nodes) {
    const similarity = similarityMap.get(node.id) ?? 0;

    const breakdown = {
      activation: node.activation,
      similarity,
      strength: node.strength,
      importance: node.importance,
    };

    const score =
      weights.activation * breakdown.activation +
      weights.similarity * breakdown.similarity +
      weights.strength * breakdown.strength +
      weights.importance * breakdown.importance;

    results.push({ node, score, breakdown });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}
