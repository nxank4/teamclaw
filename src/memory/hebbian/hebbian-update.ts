/**
 * Hebbian weight update — "neurons that fire together wire together".
 * Ported from hebbmem: asymptotic weight strengthening.
 */

import type { HebbianConfig } from "./types.js";
import type { HebbianStore } from "./store.js";

/**
 * Strengthen edges between all pairs of co-activated nodes.
 * Creates edges if they don't exist. Edges are undirected
 * (stored in both directions).
 *
 * Formula (from hebbmem): w_new = min(1.0, w + lr * (1 - w))
 */
export function hebbianUpdate(
  store: HebbianStore,
  config: HebbianConfig,
  activatedIds: string[],
): void {
  const ids = new Set(activatedIds);
  if (ids.size < 2) return;

  const lr = config.hebbianLR;
  const idList = [...ids];

  for (let i = 0; i < idList.length; i++) {
    for (let j = i + 1; j < idList.length; j++) {
      const a = idList[i]!;
      const b = idList[j]!;
      strengthenEdge(store, a, b, lr);
      strengthenEdge(store, b, a, lr);
    }
  }
}

function strengthenEdge(store: HebbianStore, sourceId: string, targetId: string, lr: number): void {
  const existing = store.getEdge(sourceId, targetId);

  if (existing) {
    existing.weight = Math.min(1.0, existing.weight + lr * (1.0 - existing.weight));
    existing.coActivationCount += 1;
    store.upsertEdge(existing);
  } else {
    store.upsertEdge({
      sourceId,
      targetId,
      weight: Math.min(1.0, lr),
      coActivationCount: 1,
    });
  }
}
