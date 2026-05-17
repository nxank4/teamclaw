/**
 * Prompt-complexity classifier.
 *
 * Heuristic-based — no LLM call. Used by the dispatcher path (not yet
 * wired in this batch) to decide whether a prompt warrants the spec /
 * plan workflow versus going straight to single-turn dispatch.
 *
 * Rules: any single match flips the result to `"complex"`.
 *   - prompt token estimate exceeds `config.tokens` (default 100)
 *   - prompt mentions more than `config.fileMentions` distinct file
 *     paths (default 2)
 *   - prompt contains a trigger word at word boundaries (case-insensitive):
 *     refactor, build, migrate, integrate, redesign, implement
 *   - prompt starts with the explicit `@spec` token
 *
 * Bias: the heuristic over-classifies as complex on purpose. The
 * dispatcher will get a chance to override; false positives are
 * cheaper than missing a spec-worthy prompt.
 */

import { estimateTokens } from "../context/context-tracker.js";

export interface ComplexityConfig {
  tokens: number;
  fileMentions: number;
}

export const DEFAULT_COMPLEXITY_CONFIG: ComplexityConfig = {
  tokens: 100,
  fileMentions: 2,
};

export type ComplexityClass = "trivial" | "complex";

export interface ComplexityResult {
  class: ComplexityClass;
  /** Each rule contributes one entry when it fires; `[]` for trivial. */
  reasons: string[];
}

const TRIGGER_WORDS = [
  "refactor",
  "build",
  "migrate",
  "integrate",
  "redesign",
  "implement",
] as const;

const TRIGGER_RE = new RegExp(`\\b(${TRIGGER_WORDS.join("|")})\\b`, "i");

// Path-shaped tokens — at least one `/` between word-y segments and a
// trailing segment that includes either a file extension or a
// dot-separated identifier. Conservative to avoid matching URLs or
// english fragments like "and/or".
const FILE_PATH_RE = /(?:[A-Za-z0-9_-]+\/)+[A-Za-z0-9_.-]+/g;

export function classify(
  prompt: string,
  config: ComplexityConfig = DEFAULT_COMPLEXITY_CONFIG,
): ComplexityResult {
  const reasons: string[] = [];

  // Explicit user signal — short-circuit on the first rule.
  if (/^\s*@spec\b/i.test(prompt)) {
    reasons.push("@spec prefix");
  }

  const tokens = estimateTokens(prompt);
  if (tokens > config.tokens) {
    reasons.push(`tokens ${tokens} > ${config.tokens}`);
  }

  const matches = prompt.match(FILE_PATH_RE) ?? [];
  const distinctPaths = new Set(matches).size;
  if (distinctPaths > config.fileMentions) {
    reasons.push(`file_mentions ${distinctPaths} > ${config.fileMentions}`);
  }

  const triggerMatch = prompt.match(TRIGGER_RE);
  if (triggerMatch) {
    reasons.push(`trigger_word ${triggerMatch[1]?.toLowerCase()}`);
  }

  return {
    class: reasons.length > 0 ? "complex" : "trivial",
    reasons,
  };
}
