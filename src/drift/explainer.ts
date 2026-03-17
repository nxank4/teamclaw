/**
 * Conflict explanation generator — template-based, no LLM calls.
 */

import type { ConflictType } from "./types.js";

const TEMPLATES: Record<ConflictType, string> = {
  direct:
    'Your goal mentions {goalFragment}, but the team previously decided to "{decision}". Reasoning: "{reasoning}"',
  indirect:
    'Your goal involves {goalFragment}, which may conflict with a past decision: "{decision}".',
  ambiguous:
    "Your goal overlaps with a past decision about {topic}. Worth reviewing before proceeding.",
};

export function generateExplanation(
  conflictType: ConflictType,
  goalFragment: string,
  decision: string,
  reasoning: string,
  topic: string,
): string {
  return TEMPLATES[conflictType]
    .replace("{goalFragment}", goalFragment)
    .replace("{decision}", decision)
    .replace("{reasoning}", reasoning.slice(0, 120))
    .replace("{topic}", topic);
}
