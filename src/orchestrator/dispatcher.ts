/**
 * Orchestrator dispatcher.
 *
 * Resolves a task to one or more agents from the markdown registry via
 * similarity match, then spawns each via {@link runSubagent} (in
 * parallel when top-K > 1). Returns a {@link DispatchResult} shaped
 * like the existing router contract so callers can substitute this for
 * the legacy classifier/resolver/dispatcher pipeline.
 *
 * Failure handling: per-subagent errors do NOT abort the dispatch —
 * they produce an {@link AgentResult} with `success: false` and the
 * error message in `error`. A dispatch with zero successful agents
 * still returns a result; the caller decides what to surface.
 */

import { debugLog } from "../debug/logger.js";
import type { AgentRegistry } from "../agents/registry/markdown-registry.js";
import { similarityTopK } from "../memory/embeddings/similarity.js";
import type { ToolDef } from "../engine/llm.js";
import type { NativeToolDefinition } from "../providers/stream-types.js";
import type { ToolExecutor } from "../router/agent-turn.js";
import type { AgentResult, DispatchResult } from "../router/router-types.js";

import {
  runSubagent,
  type SubagentProgressEmitter,
  type SubagentTokenEmitter,
} from "./subagent-runner.js";
import { WriteLockManager } from "./write-lock.js";

export interface OrchestratorDispatchArgs {
  task: string;
  registry: AgentRegistry;
  sessionId: string;
  executeTool: ToolExecutor;
  /** Tool schemas factory — typically `toolReg.exportForLLM`. */
  getToolSchemas?: (toolNames: string[]) => ToolDef[];
  /** Native tool defs factory — typically `toolReg.exportForAPI`. */
  getNativeTools?: (toolNames: string[]) => NativeToolDefinition[];
  /** How many agents to spawn in parallel. Default 3. */
  topK?: number;
  /** Minimum similarity score for inclusion. Below this, drop. Default 0.05. */
  threshold?: number;
  /** Force the keyword-only path (skip embedder). Useful for tests / offline runs. */
  forceKeyword?: boolean;
  /** Optional model override. Per-agent model on the AgentDefinition takes precedence. */
  model?: string;
  signal?: AbortSignal;
  onProgress?: SubagentProgressEmitter;
  onToken?: SubagentTokenEmitter;
}

export async function dispatch(
  args: OrchestratorDispatchArgs,
): Promise<DispatchResult> {
  const start = Date.now();
  const candidates = args.registry.all();
  const matches = await similarityTopK(args.task, candidates, {
    topK: args.topK ?? 3,
    threshold: args.threshold ?? 0.05,
    forceKeyword: args.forceKeyword,
  });

  const chosen = matches.length > 0
    ? matches.map((m) => m.agent)
    : (() => {
        const fb = args.registry.fallback();
        return fb ? [fb] : [];
      })();

  debugLog("info", "orchestrator", "dispatch_chosen", {
    data: {
      task_excerpt: args.task.slice(0, 80),
      candidate_count: candidates.length,
      match_count: matches.length,
      chosen: chosen.map((a) => a.id),
      sources: matches.map((m) => m.source),
      fallback_used: matches.length === 0,
    },
  });

  if (chosen.length === 0) {
    return {
      strategy: "single",
      agentResults: [],
      totalDuration: Date.now() - start,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };
  }

  const lockManager = new WriteLockManager();
  const settled = await Promise.allSettled(
    chosen.map((agent) =>
      runSubagent({
        agent_def: agent,
        prompt: args.task,
        artifact_reader: null,
        depth: 0,
        parent_agent_id: null,
        write_lock_manager: lockManager,
        session_id: args.sessionId,
        executeTool: args.executeTool,
        getToolSchemas: args.getToolSchemas,
        getNativeTools: args.getNativeTools,
        model: args.model,
        signal: args.signal,
        onProgress: args.onProgress,
        onToken: args.onToken,
      }),
    ),
  );

  const agentResults: AgentResult[] = settled.map((outcome, idx) => {
    const agent = chosen[idx]!;
    if (outcome.status === "fulfilled") {
      const sub = outcome.value;
      return {
        agentId: agent.id,
        success: true,
        response: sub.summary,
        toolCalls: [],
        duration: Date.now() - start,
        inputTokens: sub.tokens_breakdown?.input ?? 0,
        outputTokens: sub.tokens_breakdown?.output ?? 0,
      };
    }
    return {
      agentId: agent.id,
      success: false,
      response: "",
      toolCalls: [],
      duration: Date.now() - start,
      inputTokens: 0,
      outputTokens: 0,
      error:
        outcome.reason instanceof Error
          ? outcome.reason.message
          : String(outcome.reason),
    };
  });

  return {
    strategy: chosen.length > 1 ? "parallel" : "single",
    agentResults,
    totalDuration: Date.now() - start,
    totalInputTokens: agentResults.reduce((s, r) => s + r.inputTokens, 0),
    totalOutputTokens: agentResults.reduce((s, r) => s + r.outputTokens, 0),
  };
}
