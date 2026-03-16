/**
 * Retrieve and rank success patterns by semantic similarity.
 */

import type { HttpEmbeddingFunction } from "../../core/knowledge-base.js";
import type { SuccessPatternStore } from "./store.js";
import type { SuccessPattern } from "./types.js";

export interface RetrievalOptions {
  limit?: number;
  minConfidence?: number;
  minQualityScore?: number;
  preferFirstAttempt?: boolean;
}

const DEFAULT_OPTIONS: Required<RetrievalOptions> = {
  limit: 5,
  minConfidence: 0.75,
  minQualityScore: 0.4,
  preferFirstAttempt: true,
};

export async function retrieveSuccessPatterns(
  store: SuccessPatternStore,
  embedder: HttpEmbeddingFunction,
  query: string,
  opts?: RetrievalOptions,
): Promise<SuccessPattern[]> {
  const options = { ...DEFAULT_OPTIONS, ...opts };

  const vector = (await embedder.generate([query]))[0] ?? [];
  if (!Array.isArray(vector) || vector.length === 0) {
    return [];
  }

  // Fetch extra candidates for post-filtering
  const candidates = await store.search(vector, options.limit * 3);

  let filtered = candidates.filter((p) => p.confidence >= options.minConfidence);

  // Sort: prefer no-rework, then by distance
  if (options.preferFirstAttempt) {
    filtered.sort((a, b) => {
      if (a.reworkCount === 0 && b.reworkCount !== 0) return -1;
      if (a.reworkCount !== 0 && b.reworkCount === 0) return 1;
      return a._distance - b._distance;
    });
  }

  return filtered.slice(0, options.limit);
}
