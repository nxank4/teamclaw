/**
 * Goal fragment extractor — identifies the specific part of a goal
 * that triggered a conflict with a past decision.
 * No LLM calls. Rule-based extraction.
 */

/**
 * Extract the fragment of the goal most relevant to the conflicting decision.
 * Returns at most 10 words.
 */
export function extractGoalFragment(goal: string, decisionTags: string[]): string {
  const sentences = goal.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
  const lowerTags = decisionTags.map((t) => t.toLowerCase());

  // Find sentence with most tag overlap
  let bestSentence = sentences[0] ?? goal;
  let bestScore = 0;

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    let score = 0;
    for (const tag of lowerTags) {
      if (lower.includes(tag)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestSentence = sentence;
    }
  }

  // Trim to max 10 words
  const words = bestSentence.trim().split(/\s+/);
  if (words.length <= 10) return bestSentence.trim();
  return words.slice(0, 10).join(" ") + "...";
}
