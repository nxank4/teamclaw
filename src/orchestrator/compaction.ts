/**
 * Context compaction at phase boundary.
 *
 * Trigger: at the start of each phase iteration, before phase execution
 * begins. The runner sums the byte counts of every recorded phase
 * artifact, divides by the rough 4-chars-per-token heuristic used
 * elsewhere, and fires compaction when the estimate crosses
 * `threshold_ratio × model_context_window`.
 *
 * Compaction shape:
 *   - For every completed phase EXCEPT the most recent one (recency
 *     preserved verbatim):
 *     - Skip if a compaction artifact already covers the phase summary.
 *     - Spawn the facilitator agent via runSubagent with a "summarize
 *       this phase in ≤200 words, preserve task IDs / file paths / key
 *       decisions" prompt.
 *     - Return the compaction record in {@link CompactedPhase}. No disk
 *     - persistence — the caller decides what to do with the summary.
 *
 * Failure modes (caught + logged + skipped, never aborts the run):
 *   - Subagent throws
 *   - Token-budget exhaustion
 *   - Empty model output
 */

import { randomUUID } from "node:crypto";

import { debugLog } from "../debug/logger.js";

import {
  runSubagent as defaultRunSubagent,
  type RunSubagentArgs,
  type SubagentProgressEmitter,
  type SubagentResult,
  type SubagentTokenEmitter,
} from "./subagent-runner.js";
import { type AgentDefinition } from "./types.js";
import { WriteLockManager } from "./write-lock.js";

export const DEFAULT_COMPACT_THRESHOLD_RATIO = 0.8;
export const DEFAULT_MODEL_CONTEXT_WINDOW = 200_000;
const FACILITATOR_AGENT_ID = "planner";

const TOKEN_HEURISTIC = (text: string): number => Math.ceil(text.length / 4);

/**
 * Minimal phase-summary type the compactor consumes. Callers map their
 * own phase records (e.g. the legacy crew-runner's PhaseSummaryArtifact)
 * into this shape before calling checkAndCompact.
 */
export interface PhaseSummaryInput {
  /** Stable phase id used in the supersession chain. */
  id: string;
  /** Display name for the prompt context. */
  name: string;
  /** Status — only phases marked "completed" are eligible for compaction. */
  status: "pending" | "in_progress" | "completed" | "failed";
  /** Total tokens already attributed to this phase's outputs. Used for threshold math. */
  approx_tokens: number;
  /** Markdown summarising the phase's outcome — fed to the facilitator subagent. */
  outcome_markdown: string;
  /** Optional caller-supplied tool-call count, useful for "dropped tool-result count" telemetry. */
  tool_call_count?: number;
  /** True when the phase already has a compaction record and should be skipped. */
  already_compacted?: boolean;
}

export interface CheckAndCompactArgs {
  phases: PhaseSummaryInput[];
  /** Facilitator agent invoked to produce the compact summary. */
  agent: AgentDefinition;
  write_lock_manager: WriteLockManager;
  session_id: string;
  max_tokens_per_task?: number;
  threshold_ratio?: number;
  model_context_window?: number;
  runSubagentImpl?: (args: RunSubagentArgs) => Promise<SubagentResult>;
  signal?: AbortSignal;
  onProgress?: SubagentProgressEmitter;
  onToken?: SubagentTokenEmitter;
}

export interface CompactedPhase {
  phase_id: string;
  before_token_count: number;
  after_token_count: number;
  summary_markdown: string;
  /** Stable id for the compaction record. Caller decides whether to persist. */
  compaction_id: string;
}

export interface CheckAndCompactResult {
  triggered: boolean;
  estimated_tokens_before: number;
  threshold_tokens: number;
  compacted_phases: CompactedPhase[];
  total_tokens_dropped: number;
  skipped_phases: Array<{ phase_id: string; reason: string }>;
}

function envThreshold(): number | undefined {
  const raw = process.env.OPENPAWL_COMPACT_AT;
  if (!raw) return undefined;
  const num = Number(raw);
  if (!Number.isFinite(num)) return undefined;
  if (num > 0 && num <= 1) return num;
  return undefined;
}

function buildCompactionPrompt(phase: PhaseSummaryInput): string {
  return `# Compaction request — phase '${phase.name}' (${phase.id})

You are compacting a completed phase to reduce context-window pressure.
Produce markdown ≤ 200 words that preserves:
- task IDs that ran and their statuses
- file paths created or modified
- key decisions worth carrying forward

Drop conversational fluff, redundant agent commentary, and anything not actionable for later phases.

## Phase outcome

${phase.outcome_markdown || "(no outcome recorded)"}

# Output

Markdown ONLY, ≤ 200 words. No JSON, no code fences. Begin with a single line summary, then bullets.`;
}

export async function checkAndCompact(
  args: CheckAndCompactArgs,
): Promise<CheckAndCompactResult> {
  const thresholdRatio =
    args.threshold_ratio ?? envThreshold() ?? DEFAULT_COMPACT_THRESHOLD_RATIO;
  const contextWindow =
    args.model_context_window ?? DEFAULT_MODEL_CONTEXT_WINDOW;
  const thresholdTokens = Math.floor(thresholdRatio * contextWindow);
  const runSubagent = args.runSubagentImpl ?? defaultRunSubagent;

  const completedPhases = args.phases.filter((p) => p.status === "completed");
  const skipped: CheckAndCompactResult["skipped_phases"] = [];

  const beforeTokens = completedPhases.reduce(
    (sum, p) => sum + p.approx_tokens,
    0,
  );

  if (beforeTokens <= thresholdTokens) {
    return {
      triggered: false,
      estimated_tokens_before: beforeTokens,
      threshold_tokens: thresholdTokens,
      compacted_phases: [],
      total_tokens_dropped: 0,
      skipped_phases: skipped,
    };
  }

  // Preserve the most recent completed phase verbatim. Compact all earlier ones.
  const compactionTargets = completedPhases.slice(0, -1);
  if (compactionTargets.length === 0) {
    return {
      triggered: true,
      estimated_tokens_before: beforeTokens,
      threshold_tokens: thresholdTokens,
      compacted_phases: [],
      total_tokens_dropped: 0,
      skipped_phases: completedPhases.map((p) => ({
        phase_id: p.id,
        reason: "only_one_completed_phase",
      })),
    };
  }

  const compacted: CompactedPhase[] = [];
  let totalDropped = 0;
  const taskBudget = args.max_tokens_per_task ?? 50_000;
  const subagentInput = Math.max(2_000, Math.floor(taskBudget / 4));

  for (const phase of compactionTargets) {
    if (phase.already_compacted) {
      skipped.push({ phase_id: phase.id, reason: "already_compacted" });
      continue;
    }

    let summaryMarkdown: string;
    try {
      const result = await runSubagent({
        agent_def: args.agent,
        prompt: buildCompactionPrompt(phase),
        artifact_reader: null,
        depth: 0,
        parent_agent_id: "compaction",
        write_lock_manager: args.write_lock_manager,
        session_id: args.session_id,
        token_budget: {
          max_input: subagentInput,
          max_output: Math.max(1_000, Math.floor(subagentInput / 2)),
        },
        signal: args.signal,
        onProgress: args.onProgress,
        onToken: args.onToken,
      });
      summaryMarkdown = result.summary.trim();
      if (summaryMarkdown.length === 0) {
        skipped.push({
          phase_id: phase.id,
          reason: "empty_compaction_output",
        });
        continue;
      }
    } catch (err) {
      debugLog("warn", "orchestrator", "compaction:subagent_failed", {
        data: { phase_id: phase.id },
        error: err instanceof Error ? err.message : String(err),
      });
      skipped.push({ phase_id: phase.id, reason: "subagent_failed" });
      continue;
    }

    const afterPhaseTokens = TOKEN_HEURISTIC(summaryMarkdown);
    const beforePhaseTokens = phase.approx_tokens;
    const compaction: CompactedPhase = {
      phase_id: phase.id,
      before_token_count: beforePhaseTokens,
      after_token_count: afterPhaseTokens,
      summary_markdown: summaryMarkdown,
      compaction_id: randomUUID(),
    };

    debugLog("info", "orchestrator", "context_compacted", {
      data: {
        phase_id: phase.id,
        before_tokens: beforePhaseTokens,
        after_tokens: afterPhaseTokens,
        compaction_id: compaction.compaction_id,
      },
    });

    compacted.push(compaction);
    totalDropped += beforePhaseTokens - afterPhaseTokens;
  }

  // Marker for the unused facilitator ID — kept for future caller-side
  // logging hooks. Referenced here so lint/typecheck don't flag the
  // constant as unused while no caller exercises it yet.
  void FACILITATOR_AGENT_ID;

  return {
    triggered: true,
    estimated_tokens_before: beforeTokens,
    threshold_tokens: thresholdTokens,
    compacted_phases: compacted,
    total_tokens_dropped: totalDropped,
    skipped_phases: skipped,
  };
}
