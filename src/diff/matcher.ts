/**
 * Task matching algorithm — matches tasks between runs without LLM calls.
 * Uses exact taskId match first, then cosine similarity on description tokens.
 */

import type { TaskSnapshot, TaskMatch } from "./types.js";

const SIMILARITY_THRESHOLD = 0.8;

/** Match tasks from two runs. Returns matched pairs, added, and removed. */
export function matchTasks(
  fromTasks: TaskSnapshot[],
  toTasks: TaskSnapshot[],
): {
  matched: TaskMatch[];
  added: TaskSnapshot[];
  removed: TaskSnapshot[];
} {
  const matched: TaskMatch[] = [];
  const unmatchedFrom = new Map(fromTasks.map((t) => [t.taskId, t]));
  const unmatchedTo = new Map(toTasks.map((t) => [t.taskId, t]));

  // Pass 1: exact taskId match
  for (const [id, fromTask] of unmatchedFrom) {
    const toTask = unmatchedTo.get(id);
    if (toTask) {
      matched.push({ fromTask, toTask, matchType: "exact" });
      unmatchedFrom.delete(id);
      unmatchedTo.delete(id);
    }
  }

  // Pass 2: fuzzy match remaining by description similarity
  const remainingFrom = Array.from(unmatchedFrom.values());
  const remainingTo = Array.from(unmatchedTo.values());

  // Build similarity matrix and greedily match best pairs
  const pairs: { from: TaskSnapshot; to: TaskSnapshot; score: number }[] = [];
  for (const f of remainingFrom) {
    for (const t of remainingTo) {
      const score = cosineSimilarity(tokenize(f.description), tokenize(t.description));
      if (score >= SIMILARITY_THRESHOLD) {
        pairs.push({ from: f, to: t, score });
      }
    }
  }

  // Sort by score descending, greedily assign
  pairs.sort((a, b) => b.score - a.score);
  const usedFrom = new Set<string>();
  const usedTo = new Set<string>();

  for (const pair of pairs) {
    if (usedFrom.has(pair.from.taskId) || usedTo.has(pair.to.taskId)) continue;
    matched.push({ fromTask: pair.from, toTask: pair.to, matchType: "fuzzy" });
    usedFrom.add(pair.from.taskId);
    usedTo.add(pair.to.taskId);
    unmatchedFrom.delete(pair.from.taskId);
    unmatchedTo.delete(pair.to.taskId);
  }

  return {
    matched,
    added: Array.from(unmatchedTo.values()),
    removed: Array.from(unmatchedFrom.values()),
  };
}

/** Tokenize a string into lowercase word tokens. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/** Cosine similarity between two token arrays. */
export function cosineSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const freqA = termFrequency(tokensA);
  const freqB = termFrequency(tokensB);

  const allTerms = new Set([...freqA.keys(), ...freqB.keys()]);

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (const term of allTerms) {
    const a = freqA.get(term) ?? 0;
    const b = freqB.get(term) ?? 0;
    dotProduct += a * b;
    magA += a * a;
    magB += b * b;
  }

  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  if (magnitude === 0) return 0;
  return dotProduct / magnitude;
}

function termFrequency(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return freq;
}

const STOP_WORDS = new Set([
  "the", "is", "at", "which", "on", "a", "an", "and", "or", "but",
  "in", "with", "to", "for", "of", "it", "be", "as", "do", "by",
  "from", "that", "this", "not", "are", "was", "were", "been", "has",
  "have", "had", "will", "would", "could", "should", "may", "might",
  "can", "if", "then", "so", "no", "yes", "all", "any", "each",
]);
