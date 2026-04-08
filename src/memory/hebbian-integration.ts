/**
 * Hebbian integration — connects the Hebbian memory layer to OpenPawl's
 * existing memory pipeline. Provides hooks for:
 *
 * 1. Re-ranking LanceDB results via HybridRetriever
 * 2. Storing lessons/patterns/decisions in the Hebbian graph
 * 3. Co-activating memories used together
 * 4. Decaying at session end
 *
 * Usage: call initHebbianIntegration() at session start,
 *        call the returned hooks during the session,
 *        call cleanup() at session end.
 */

import { join } from "node:path";
import os from "node:os";
import { HebbianMemory } from "./hebbian/index.js";
import { HybridRetriever, type LanceCandidate } from "./hybrid-retriever.js";
import type { MemoryResult } from "./hebbian/types.js";
import { readGlobalConfig } from "../core/global-config.js";

export interface HebbianIntegration {
  /** Re-rank LanceDB candidates using Hebbian signals. */
  rerank(candidates: LanceCandidate[], topK?: number): MemoryResult[];
  /** Store a memory in the Hebbian graph. */
  store(content: string, options?: {
    id?: string;
    importance?: number;
    category?: "lesson" | "pattern" | "decision" | "context";
    metadata?: Record<string, unknown>;
    coActivateWith?: string[];
  }): string;
  /** Co-activate memories that were used together. */
  coActivate(ids: string[]): void;
  /** Get stats for /memory stats command. */
  getStats(): { nodeCount: number; edgeCount: number; avgStrength: number; categoryBreakdown: Record<string, number> };
  /** Decay + close at session end. */
  cleanup(): void;
  /** Whether Hebbian is enabled. */
  enabled: boolean;
}

/**
 * Initialize the Hebbian integration layer.
 * Reads config from global config. Returns a no-op facade when disabled.
 */
export function initHebbianIntegration(): HebbianIntegration {
  const globalConfig = readGlobalConfig();
  const hebbConfig = globalConfig?.hebbian;
  const enabled = hebbConfig?.enabled !== false; // default true

  if (!enabled) {
    return createNoopIntegration();
  }

  const dbPath = join(os.homedir(), ".openpawl", "memory", "hebbian.db");

  const hebbian = new HebbianMemory({
    dbPath,
    activationDecay: hebbConfig?.activationDecay,
    strengthDecay: hebbConfig?.strengthDecay,
    edgeDecay: hebbConfig?.edgeDecay,
    hebbianLR: hebbConfig?.hebbianLR,
    spreadFactor: hebbConfig?.spreadFactor,
    maxHops: hebbConfig?.maxHops,
  });

  const retriever = new HybridRetriever(hebbian, {
    candidateCount: hebbConfig?.candidateCount ?? 20,
    finalCount: hebbConfig?.finalCount ?? 5,
    enabled: true,
  });

  return {
    enabled: true,
    rerank: (candidates, topK) => retriever.rerank(candidates, topK),
    store: (content, opts) => retriever.store(content, opts),
    coActivate: (ids) => retriever.coActivate(ids),
    getStats: () => retriever.getStats(),
    cleanup() {
      retriever.step(1); // decay by 1 tick
      retriever.close();
    },
  };
}

function createNoopIntegration(): HebbianIntegration {
  return {
    enabled: false,
    rerank: (candidates, topK) =>
      candidates.slice(0, topK ?? 5).map((c) => ({
        node: {
          id: c.id,
          content: c.content,
          strength: 1,
          activation: c.similarity,
          importance: 0.5,
          category: "context" as const,
          metadata: c.metadata ?? {},
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
        },
        score: c.similarity,
        breakdown: { activation: c.similarity, similarity: c.similarity, strength: 1, importance: 0.5 },
      })),
    store: () => "",
    coActivate: () => {},
    getStats: () => ({ nodeCount: 0, edgeCount: 0, avgStrength: 0, categoryBreakdown: {} }),
    cleanup: () => {},
  };
}
