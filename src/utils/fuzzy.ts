/**
 * Lightweight Levenshtein distance for fuzzy command matching.
 * No external dependencies.
 */

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Single-row DP for memory efficiency
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j]! + 1,       // deletion
        curr[j - 1]! + 1,   // insertion
        prev[j - 1]! + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n]!;
}

/**
 * Find the closest match from a list of candidates.
 * Returns null if no match within maxDistance.
 */
export function findClosest(input: string, candidates: string[], maxDistance = 2): string | null {
  const lower = input.toLowerCase();
  let best: string | null = null;
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const dist = levenshtein(lower, candidate.toLowerCase());
    if (dist < bestDist && dist <= maxDistance) {
      bestDist = dist;
      best = candidate;
    }
  }

  return best;
}
