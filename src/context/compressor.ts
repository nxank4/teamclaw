/**
 * Sliding window context compression.
 * When conversation exceeds ~70% of context window, older messages
 * are summarized into a compressed block. Recent messages stay intact.
 */
import type { Message } from "../engine/llm.js";

export interface CompressedContext {
  summary: string;
  messageCount: number;
  tokenEstimate: number;
}

export interface CompressionResult {
  compressed: CompressedContext | null;
  messages: Message[];
}

/** Rough token estimation: ~4 chars per token. */
export function estimateTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
}

/**
 * Compress conversation context if it exceeds the threshold.
 *
 * @param messages - Full message history
 * @param maxTokens - Model's context window size
 * @param keepRecent - Number of recent messages to keep uncompressed
 * @param threshold - Fraction of maxTokens before compression triggers (default 0.7)
 * @param summarize - Async function that generates a summary of messages
 */
export async function compressContext(
  messages: Message[],
  maxTokens: number,
  keepRecent: number,
  threshold: number,
  summarize: (text: string) => Promise<string>,
): Promise<CompressionResult> {
  const totalTokens = estimateTokens(messages);

  if (totalTokens < maxTokens * threshold) {
    return { compressed: null, messages };
  }

  if (messages.length <= keepRecent) {
    return { compressed: null, messages };
  }

  const toCompress = messages.slice(0, -keepRecent);
  const toKeep = messages.slice(-keepRecent);

  const conversationText = toCompress
    .filter((m) => m.role !== "system")
    .map((m) => {
      const prefix = m.role === "user" ? "User" : m.role === "tool" ? "Tool" : "Assistant";
      return `${prefix}: ${m.content.slice(0, 500)}`;
    })
    .join("\n");

  const summary = await summarize(conversationText);

  const compressedTokens = estimateTokens(toCompress);
  const summaryTokens = Math.ceil(summary.length / 4);

  const summaryMessage: Message = {
    role: "system",
    content: `[Conversation Summary — ${toCompress.length} earlier messages compressed]\n${summary}`,
  };

  return {
    compressed: {
      summary,
      messageCount: toCompress.length,
      tokenEstimate: compressedTokens - summaryTokens,
    },
    messages: [summaryMessage, ...toKeep],
  };
}
