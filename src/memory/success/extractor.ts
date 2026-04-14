/**
 * Extract success patterns from approved tasks.
 */

import { randomUUID } from "node:crypto";
import type { SuccessPattern } from "./types.js";

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "it", "of", "in", "to", "and", "or", "for",
  "on", "at", "by", "as", "be", "do", "if", "no", "so", "up", "we",
  "am", "he", "me", "my", "us", "was", "are", "but", "can", "did",
  "get", "got", "had", "has", "her", "him", "his", "how", "its", "let",
  "may", "not", "now", "our", "own", "say", "she", "too", "use", "all",
  "any", "few", "new", "old", "one", "out", "own", "put", "run", "set",
  "two", "way", "who", "yet", "been", "each", "from", "have", "into",
  "just", "like", "make", "many", "more", "most", "much", "must", "need",
  "only", "over", "some", "such", "take", "than", "that", "them", "then",
  "they", "this", "very", "what", "when", "will", "with", "your",
]);

export interface TaskForExtraction {
  task_id: string;
  description: string;
  assigned_to: string;
  status: string;
  retry_count: number;
  result: {
    output?: string;
    confidence?: { score: number };
  } | null;
}

export function extractSuccessPattern(
  task: TaskForExtraction,
  goalContext: string,
  sessionId: string,
  runIndex: number,
): SuccessPattern | null {
  const status = task.status;
  const retryCount = task.retry_count ?? 0;

  // Only extract from completed or auto-approved tasks with low rework
  if (status !== "completed" && status !== "auto_approved_pending") {
    return null;
  }
  if (retryCount >= 2) {
    return null;
  }

  const result = task.result;
  const output = result?.output ?? "";
  const approach = output.slice(0, 300);
  const confidence = result?.confidence?.score ?? 0.5;
  const approvalType: "auto" | "user" = status === "auto_approved_pending" ? "auto" : "user";

  return {
    id: `success_${randomUUID()}`,
    sessionId,
    taskDescription: task.description ?? "",
    agentRole: task.assigned_to ?? "",
    approach,
    resultSummary: output.slice(0, 200),
    confidence,
    approvalType,
    reworkCount: retryCount,
    goalContext,
    tags: extractKeywords(task.description ?? ""),
    createdAt: Date.now(),
    runIndex,
  };
}

export function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);
  const freq = new Map<string, number>();
  for (const word of words) {
    if (word.length < 2 || STOP_WORDS.has(word)) continue;
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

export function buildEmbeddingText(pattern: Pick<SuccessPattern, "taskDescription" | "approach" | "goalContext">): string {
  return `${pattern.taskDescription} ${pattern.approach} ${pattern.goalContext}`;
}
