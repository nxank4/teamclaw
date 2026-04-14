/**
 * Ebbinghaus-inspired decay functions.
 * Ported from hebbmem: activation decays fast, strength decays slow.
 */

import type { HebbianConfig } from "./types.js";
import type { HebbianStore } from "./store.js";

/**
 * Apply decay to all nodes and edges over `ticks` time steps.
 * Prunes edges with weight below 0.01 after decay.
 */
export function applyDecay(store: HebbianStore, config: HebbianConfig, ticks: number): void {
  if (ticks <= 0) return;

  const strengthMultiplier = Math.pow(config.strengthDecay, ticks);
  const activationMultiplier = Math.pow(config.activationDecay, ticks);
  const edgeMultiplier = Math.pow(config.edgeDecay, ticks);

  // Decay nodes
  const nodes = store.getActiveNodes(0); // get all nodes
  const nodeUpdates = nodes.map((n) => ({
    id: n.id,
    strength: n.strength * strengthMultiplier,
    activation: n.activation * activationMultiplier,
  }));
  store.updateDecay(nodeUpdates);

  // Decay edges
  const edges = store.getAllEdges();
  if (edges.length > 0) {
    const edgeUpdates = edges.map((e) => ({
      sourceId: e.sourceId,
      targetId: e.targetId,
      weight: e.weight * edgeMultiplier,
    }));
    store.updateEdgeDecay(edgeUpdates);
  }

  // Prune dead edges
  store.pruneEdges(0.01);
}
