/**
 * LLM-based intent classification for user prompts.
 * Uses the cheapest available model (mini tier) since it runs on every prompt.
 * Includes fast-path bypass for obvious cases (no LLM call).
 */

import { z } from "zod";
import { Result, ok, err } from "neverthrow";
import type { PromptIntent, IntentCategory, RouterError } from "./router-types.js";
import type { AgentDefinition } from "./router-types.js";

// ─── Schema ──────────────────────────────────────────────────────────────────

export const IntentClassificationSchema = z.object({
  category: z.enum([
    "code_write", "code_edit", "code_review", "code_debug",
    "code_explain", "test_write", "test_run", "plan",
    "research", "file_ops", "git_ops", "shell",
    "conversation", "multi_step", "config", "unknown",
  ]),
  confidence: z.number().min(0).max(1),
  complexity: z.enum(["trivial", "simple", "moderate", "complex"]),
  requiresTools: z.array(z.string()),
  suggestedAgents: z.array(z.string()),
  reasoning: z.string(),
});

// ─── Types ───────────────────────────────────────────────────────────────────

/** Abstraction over the LLM call. Implementors provide the actual API call. */
export interface ClassifierLLM {
  classify(systemPrompt: string, userPrompt: string): Promise<PromptIntent>;
}

export interface ClassifierContext {
  recentMessages?: Array<{ role: string; content: string }>;
  workingDirectory?: string;
  trackedFiles?: string[];
}

// ─── Fast-path patterns (no LLM needed) ──────────────────────────────────────

const CONFIRMATION_WORDS = new Set([
  "y", "yes", "n", "no", "ok", "okay", "sure", "yep", "nope",
  "yeah", "nah", "confirm", "cancel", "abort",
]);

// ─── Classifier ──────────────────────────────────────────────────────────────

export class IntentClassifier {
  constructor(
    private llm: ClassifierLLM | null,
    private agents: AgentDefinition[],
  ) {}

  async classify(
    prompt: string,
    context?: ClassifierContext,
  ): Promise<Result<PromptIntent, RouterError>> {
    // Fast-path bypasses (zero LLM tokens)
    const fastResult = this.fastPathClassify(prompt);
    if (fastResult) return ok(fastResult);

    // LLM-based classification
    if (!this.llm) {
      // No LLM available — fall back to pattern matching
      return ok(this.patternFallback(prompt));
    }

    try {
      const systemPrompt = this.buildSystemPrompt(context);
      const intent = await this.llm.classify(systemPrompt, prompt);
      return ok(intent);
    } catch (e) {
      return err({
        type: "classification_failed",
        cause: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /**
   * Fast-path classification — returns immediately for obvious patterns.
   * Returns null if LLM classification is needed.
   */
  fastPathClassify(prompt: string): PromptIntent | null {
    const trimmed = prompt.trim();

    // Empty or whitespace
    if (!trimmed) {
      return makeTrivialIntent("conversation", "Empty prompt");
    }

    // Slash commands → config
    if (trimmed.startsWith("/")) {
      return makeTrivialIntent("config", "Slash command detected");
    }

    // Single-word confirmations
    if (CONFIRMATION_WORDS.has(trimmed.toLowerCase())) {
      return makeTrivialIntent("conversation", "Confirmation response");
    }

    // Very short prompts that match trigger patterns exactly
    const words = trimmed.split(/\s+/);
    if (words.length <= 4) {
      const patternMatch = this.matchTriggerPattern(trimmed);
      if (patternMatch) return patternMatch;
    }

    return null;
  }

  private matchTriggerPattern(prompt: string): PromptIntent | null {
    const lower = prompt.toLowerCase();

    for (const agent of this.agents) {
      if (!agent.triggerPatterns?.length) continue;
      for (const pattern of agent.triggerPatterns) {
        try {
          if (new RegExp(pattern, "i").test(lower)) {
            const category = agent.capabilities[0] as IntentCategory | undefined;
            return {
              category: category ?? "conversation",
              confidence: 0.8,
              complexity: "simple",
              requiresTools: agent.defaultTools.slice(0, 2),
              suggestedAgents: [agent.id],
              reasoning: `Trigger pattern matched for ${agent.id}`,
            };
          }
        } catch {
          // Invalid regex pattern, skip
        }
      }
    }

    return null;
  }

  /** Fallback when no LLM is available — keyword-based classification. */
  private patternFallback(prompt: string): PromptIntent {
    const lower = prompt.toLowerCase();

    const keywords: Array<[IntentCategory, RegExp, string[]]> = [
      ["code_debug", /\b(fix|debug|error|bug|crash|broken|failing)\b/, ["debugger"]],
      ["code_review", /\b(review|audit|check|analyze|inspect)\b.*\b(code|pr|changes)\b/, ["reviewer"]],
      ["test_write", /\b(write|add|create)\b.*\btest/, ["tester"]],
      ["test_run", /\b(run|execute)\b.*\btest/, ["tester"]],
      ["plan", /\b(plan|architect|design|decompose|outline)\b/, ["planner"]],
      ["research", /\b(search|find|look up|research|what is|how does)\b/, ["researcher"]],
      ["code_write", /\b(write|create|implement|build|add)\b/, ["coder"]],
      ["code_edit", /\b(modify|change|update|refactor|rename)\b/, ["coder"]],
      ["code_explain", /\b(explain|what does|how does|why does)\b/, ["assistant"]],
      ["git_ops", /\b(commit|push|pull|merge|branch|pr|pull request)\b/, ["coder"]],
      ["shell", /\b(run|execute|install|npm|pnpm|pip)\b/, ["coder"]],
      ["file_ops", /\b(read|open|create|delete|move|copy)\b.*\bfile/, ["coder"]],
    ];

    for (const [category, pattern, agents] of keywords) {
      if (pattern.test(lower)) {
        return {
          category,
          confidence: 0.6,
          complexity: "simple",
          requiresTools: [],
          suggestedAgents: agents,
          reasoning: `Keyword pattern matched for ${category}`,
        };
      }
    }

    return {
      category: "conversation",
      confidence: 0.5,
      complexity: "simple",
      requiresTools: [],
      suggestedAgents: ["assistant"],
      reasoning: "No specific pattern matched, defaulting to conversation",
    };
  }

  private buildSystemPrompt(context?: ClassifierContext): string {
    const agentList = this.agents
      .map((a) => `- ${a.id}: ${a.description}`)
      .join("\n");

    const contextLines: string[] = [];
    if (context?.workingDirectory) {
      contextLines.push(`Working directory: ${context.workingDirectory}`);
    }
    if (context?.trackedFiles?.length) {
      contextLines.push(`Tracked files: ${context.trackedFiles.slice(0, 10).join(", ")}`);
    }

    return [
      "You are a prompt intent classifier for an AI coding assistant.",
      "Analyze the user's prompt and classify it.",
      "",
      "Available agents:",
      agentList,
      "",
      contextLines.length ? `Context:\n${contextLines.join("\n")}` : "",
      "",
      "Rules:",
      '- "trivial": direct answer, no tools needed',
      '- "simple": one agent, one tool call',
      '- "moderate": one agent, multiple tool calls',
      '- "complex": multiple agents or multi-step',
      "- Prefer single agent + lower complexity when in doubt",
      '- "conversation" for follow-ups and general chat',
      '- "unknown" ONLY if you truly cannot understand the intent',
    ].filter(Boolean).join("\n");
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTrivialIntent(category: IntentCategory, reasoning: string): PromptIntent {
  return {
    category,
    confidence: 1.0,
    complexity: "trivial",
    requiresTools: [],
    suggestedAgents: category === "config" ? [] : ["assistant"],
    reasoning,
  };
}
