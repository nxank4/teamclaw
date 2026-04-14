/**
 * HebbianMemory — main class that ties together store, decay, activation, and scoring.
 * Manages the lifecycle of the Hebbian graph alongside LanceDB.
 */

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { HebbianStore } from "./store.js";
import { applyDecay } from "./decay.js";
import { hebbianUpdate } from "./hebbian-update.js";
import { spreadActivation, type ActivationSeed } from "./activation.js";
import { scoreNodes } from "./scorer.js";
import type { HebbianConfig, MemoryNode, MemoryResult } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

export class HebbianMemory {
  private store: HebbianStore;
  private config: HebbianConfig;

  constructor(config?: Partial<HebbianConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (this.config.scoringWeights !== DEFAULT_CONFIG.scoringWeights && config?.scoringWeights) {
      this.config.scoringWeights = { ...DEFAULT_CONFIG.scoringWeights, ...config.scoringWeights };
    }

    mkdirSync(dirname(this.config.dbPath), { recursive: true });
    this.store = new HebbianStore(this.config.dbPath);
  }

  /**
   * Store a new memory node. Returns the generated ID.
   */
  storeNode(
    content: string,
    options?: {
      id?: string;
      importance?: number;
      category?: MemoryNode["category"];
      metadata?: Record<string, unknown>;
    },
  ): string {
    const id = options?.id ?? randomUUID();
    const now = Date.now();

    this.store.upsertNode({
      id,
      content,
      strength: 1.0,
      activation: 0.0,
      importance: options?.importance ?? 0.5,
      category: options?.category ?? "context",
      metadata: options?.metadata ?? {},
      createdAt: now,
      lastAccessedAt: now,
    });

    return id;
  }

  /**
   * Activate seeds, spread activation, score, and return top results.
   * Seeds typically come from LanceDB search results.
   */
  recall(
    seeds: ActivationSeed[],
    similarityMap: Map<string, number>,
    topK = 5,
  ): MemoryResult[] {
    // Spread activation from seeds
    const activatedIds = spreadActivation(this.store, this.config, seeds);

    // Hebbian update: strengthen edges between co-activated nodes
    hebbianUpdate(this.store, this.config, activatedIds);

    // Touch accessed nodes
    for (const id of activatedIds) {
      this.store.touchNode(id);
    }

    // Get all activated nodes for scoring
    const nodes = this.store.getNodesByIds(activatedIds);

    // Score and rank
    return scoreNodes(nodes, similarityMap, this.config.scoringWeights, topK);
  }

  /**
   * Create or strengthen edges between the given node IDs.
   */
  coActivate(ids: string[]): void {
    hebbianUpdate(this.store, this.config, ids);
  }

  /**
   * Advance time by `ticks` steps, decaying all nodes and edges.
   * Call at the end of each work session (1 tick per session).
   */
  step(ticks: number): void {
    applyDecay(this.store, this.config, ticks);
  }

  /**
   * Get a node by ID.
   */
  getNode(id: string): MemoryNode | null {
    return this.store.getNode(id);
  }

  /**
   * Get all active (non-dormant) nodes.
   */
  getActiveNodes(): MemoryNode[] {
    return this.store.getActiveNodes();
  }

  /**
   * Get graph stats for /memory stats command.
   */
  getStats(): {
    nodeCount: number;
    edgeCount: number;
    avgStrength: number;
    categoryBreakdown: Record<string, number>;
  } {
    return this.store.getStats();
  }

  /**
   * Get a node and its immediate connections for /memory graph command.
   */
  getNodeGraph(id: string): {
    node: MemoryNode | null;
    edges: Array<{ neighborId: string; weight: number; neighborContent: string }>;
  } {
    const node = this.store.getNode(id);
    if (!node) return { node: null, edges: [] };

    const rawEdges = this.store.getNeighborEdges(id);
    const edges = rawEdges.map((e) => {
      const neighborId = e.sourceId === id ? e.targetId : e.sourceId;
      const neighbor = this.store.getNode(neighborId);
      return {
        neighborId,
        weight: e.weight,
        neighborContent: neighbor?.content.slice(0, 80) ?? "(deleted)",
      };
    });

    edges.sort((a, b) => b.weight - a.weight);
    return { node, edges };
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.store.close();
  }

  /** Expose store for testing. */
  getStore(): HebbianStore {
    return this.store;
  }
}
