/**
 * Shared types for context management: tracking, compaction, doom-loop detection,
 * and tool output summarization.
 */

// ── Context Tracking ─────────────────────────────────────────────────────────

export type ContextLevel = "normal" | "warning" | "high" | "critical" | "emergency";

export interface ContextSnapshot {
  estimatedTokens: number;
  maxTokens: number;
  utilizationPercent: number;
  level: ContextLevel;
}

export interface CompactionResult {
  strategy: string;
  beforeTokens: number;
  afterTokens: number;
  messagesAffected: number;
}

// ── Doom-Loop Detection ──────────────────────────────────────────────────────

export interface ToolCallFingerprint {
  hash: string;
  toolName: string;
  timestamp: number;
}

export type DoomLoopVerdict =
  | { action: "allow" }
  | { action: "warn"; message: string; count: number }
  | { action: "block"; message: string; count: number };

// ── Tool Output Summarization ────────────────────────────────────────────────

export interface ToolOutputConfig {
  inlineMaxChars: number;
  previewLines: number;
  scratchDir: string;
}

export interface SummarizedOutput {
  content: string;
  scratchFile?: string;
  originalSize: number;
  truncated: boolean;
}
