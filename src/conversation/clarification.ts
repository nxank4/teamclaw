/**
 * Detect ambiguous prompts that need clarification before routing.
 * Pure heuristic — NO LLM calls.
 */

import type { ClarificationNeeded } from "./types.js";

const VAGUE_PATTERNS = [
  { pattern: /^(fix|make|do)\s+(it|this|that)$/i, question: "What specifically should I fix? A file, a function, or the entire module?" },
  { pattern: /^(improve|optimize|clean)\s+(it|this|that|the code)$/i, question: "What would you like improved? Performance, readability, or something specific?" },
  { pattern: /^(change|update|modify)\s+(it|this|that)$/i, question: "What should I change? Please specify the file or component." },
];

const DESTRUCTIVE_VAGUE = [
  { pattern: /\b(delete|remove|clean up)\b.*\b(everything|all|old|unused)\b/i, question: "Which files or directories should be deleted? Please be specific." },
  { pattern: /\b(rewrite|replace)\b.*\b(everything|the whole|entire)\b/i, question: "What scope? A specific module, or the entire codebase?" },
];

export class ClarificationDetector {
  detect(
    prompt: string,
    context: { recentMessages?: Array<{ role: string; content: string }>; trackedFiles?: string[] },
  ): ClarificationNeeded | null {
    const trimmed = prompt.trim();

    // Skip clarification for explicit @agent mentions
    if (trimmed.startsWith("@")) return null;

    // Skip for read-only prompts (explain, show, list)
    if (/^(explain|show|list|describe|what|how|why)\b/i.test(trimmed)) return null;

    // Check vague patterns
    for (const { pattern, question } of VAGUE_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          reason: "Ambiguous scope — no clear target specified",
          questions: [question],
          severity: "ask",
        };
      }
    }

    // Check destructive + vague
    for (const { pattern, question } of DESTRUCTIVE_VAGUE) {
      if (pattern.test(trimmed)) {
        return {
          reason: "Destructive action without specific target",
          questions: [question],
          severity: "ask",
        };
      }
    }

    // Short prompts without file references (< 4 words, no file paths)
    const words = trimmed.split(/\s+/);
    if (words.length < 4 && !trimmed.includes("/") && !trimmed.includes(".ts") && !trimmed.includes(".js")) {
      // Only flag if it contains action verbs
      if (/\b(add|fix|change|write|create|update|remove|delete)\b/i.test(trimmed)) {
        // Check if context has few files (obvious target) or many
        if (context.trackedFiles && context.trackedFiles.length > 5) {
          return {
            reason: "Short command in a large project",
            questions: ["Which file or component should I target?"],
            severity: "suggest",
          };
        }
      }
    }

    return null;
  }
}
