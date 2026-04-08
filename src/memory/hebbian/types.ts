/**
 * Hebbian memory layer types.
 * Ported from https://github.com/codepawl/hebbmem
 */

export interface HebbianConfig {
  activationDecay: number;
  strengthDecay: number;
  edgeDecay: number;
  hebbianLR: number;
  spreadFactor: number;
  maxHops: number;
  activationThreshold: number;
  scoringWeights: ScoringWeights;
  dbPath: string;
}

export interface ScoringWeights {
  activation: number;
  similarity: number;
  strength: number;
  importance: number;
}

export const DEFAULT_CONFIG: HebbianConfig = {
  activationDecay: 0.95,
  strengthDecay: 0.999,
  edgeDecay: 0.99,
  hebbianLR: 0.1,
  spreadFactor: 0.5,
  maxHops: 3,
  activationThreshold: 0.1,
  scoringWeights: {
    activation: 0.4,
    similarity: 0.35,
    strength: 0.15,
    importance: 0.1,
  },
  dbPath: "",
};

export interface MemoryNode {
  id: string;
  content: string;
  strength: number;
  activation: number;
  importance: number;
  category: "lesson" | "pattern" | "decision" | "context";
  metadata: Record<string, unknown>;
  createdAt: number;
  lastAccessedAt: number;
}

export interface HebbianEdge {
  sourceId: string;
  targetId: string;
  weight: number;
  coActivationCount: number;
}

export interface MemoryResult {
  node: MemoryNode;
  score: number;
  breakdown: {
    activation: number;
    similarity: number;
    strength: number;
    importance: number;
  };
}
