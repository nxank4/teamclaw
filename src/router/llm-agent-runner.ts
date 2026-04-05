/**
 * LLM Agent Runner — bridges Dispatcher's AgentRunner interface to callLLM().
 * Streams tokens in real-time via the onToken callback so the TUI
 * displays response tokens as they arrive (not buffered).
 */
import type { AgentRunner } from "./dispatch-strategy.js";
import type { AgentResult } from "./router-types.js";
import { callLLM } from "../engine/llm.js";

/**
 * Creates an AgentRunner backed by the real LLM provider.
 *
 * @param onToken — called for each streamed token with (agentId, token).
 *   The Dispatcher emits dispatch:agent:token events using this callback.
 */
export function createLLMAgentRunner(
  onToken?: (agentId: string, token: string) => void,
): AgentRunner {
  return {
    async run(
      agentId: string,
      prompt: string,
      _tools: string[],
      context: {
        systemPrompt: string;
        sessionHistory?: Array<{ role: string; content: string }>;
        model?: string;
      },
      signal?: AbortSignal,
    ): Promise<AgentResult> {
      if (signal?.aborted) {
        return makeResult(agentId, false, "", "Aborted");
      }

      try {
        const response = await callLLM(prompt, {
          model: context.model,
          systemPrompt: context.systemPrompt,
          signal,
          onChunk: (token: string) => {
            onToken?.(agentId, token);
          },
        });

        return makeResult(agentId, true, response.text, undefined, response.usage);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return makeResult(agentId, false, "", msg);
      }
    },
  };
}

function makeResult(
  agentId: string,
  success: boolean,
  response: string,
  error?: string,
  usage?: { input: number; output: number },
): AgentResult {
  return {
    agentId,
    success,
    response,
    toolCalls: [],
    duration: 0,
    inputTokens: usage?.input ?? 0,
    outputTokens: usage?.output ?? 0,
    costUSD: 0,
    error,
  };
}
