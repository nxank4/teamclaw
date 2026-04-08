/**
 * Spreading activation via BFS.
 * Ported from hebbmem: energy propagates through edges, decaying per hop.
 */

import type { HebbianConfig } from "./types.js";
import type { HebbianStore } from "./store.js";

export interface ActivationSeed {
  nodeId: string;
  activation: number;
}

/**
 * Spread activation from seed nodes through the graph using BFS.
 * Returns IDs of all activated nodes (including seeds).
 *
 * Seeds get their activation set directly. Neighbors receive
 * energy = source.activation * edge.weight * spreadFactor,
 * clamped to [0, 1].
 */
export function spreadActivation(
  store: HebbianStore,
  config: HebbianConfig,
  seeds: ActivationSeed[],
): string[] {
  const activated = new Set<string>();
  const queue: Array<{ nodeId: string; hop: number }> = [];

  // In-memory activation map to avoid excessive DB writes during BFS
  const activationMap = new Map<string, number>();

  // Initialize seeds
  for (const seed of seeds) {
    const node = store.getNode(seed.nodeId);
    if (!node) continue;

    const newActivation = Math.min(1.0, seed.activation);
    activationMap.set(seed.nodeId, newActivation);
    activated.add(seed.nodeId);
    queue.push({ nodeId: seed.nodeId, hop: 0 });
  }

  // BFS propagation
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++]!;

    if (current.hop >= config.maxHops) continue;

    const currentActivation = activationMap.get(current.nodeId) ?? 0;
    const edges = store.getNeighborEdges(current.nodeId);

    for (const edge of edges) {
      const neighborId = edge.sourceId === current.nodeId ? edge.targetId : edge.sourceId;

      const spreadAmount = currentActivation * edge.weight * config.spreadFactor;
      if (spreadAmount < config.activationThreshold) continue;

      const neighborNode = store.getNode(neighborId);
      if (!neighborNode || neighborNode.strength < 0.01) continue;

      const existing = activationMap.get(neighborId) ?? 0;
      const newActivation = Math.min(1.0, existing + spreadAmount);
      activationMap.set(neighborId, newActivation);

      if (!activated.has(neighborId)) {
        activated.add(neighborId);
        queue.push({ nodeId: neighborId, hop: current.hop + 1 });
      }
    }
  }

  // Write final activation values to DB
  for (const [nodeId, activation] of activationMap) {
    store.updateNodeActivation(nodeId, activation);
  }

  return [...activated];
}
