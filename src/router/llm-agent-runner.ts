/**
 * LLM Agent Runner — bridges Dispatcher's AgentRunner interface to the real LLM.
 * Uses callLLMMultiTurn for tool loop: LLM can call tools, get results, continue.
 * Streams tokens in real-time via onToken callback.
 */
import type { AgentRunner } from "./dispatch-strategy.js";
import type { AgentResult, ToolCallSummary } from "./router-types.js";
import { callLLM, callLLMMultiTurn, type ToolDef, type Message } from "../engine/llm.js";
import { InjectionDetector } from "../security/injection-detector.js";
import type { DoomLoopDetector } from "../context/doom-loop-detector.js";
import type { ToolOutputHandler } from "../context/tool-output-handler.js";
import type { ContextTracker } from "../context/context-tracker.js";
import type { ContextLevel } from "../context/types.js";
import { compact } from "../context/compaction.js";

export interface LLMAgentRunnerOptions {
  onToken?: (agentId: string, token: string) => void;
  onToolCall?: (agentId: string, toolName: string, status: string) => void;
  /** Get tool schemas for an agent's tool list. */
  getToolSchemas?: (toolNames: string[]) => ToolDef[];
  /** Execute a tool and return the result as a string. */
  executeTool?: (toolName: string, args: Record<string, unknown>) => Promise<string>;
  /** Doom-loop detector — prevents repeated identical tool calls. */
  doomLoopDetector?: DoomLoopDetector;
  /** Tool output handler — summarizes large outputs and offloads to scratch files. */
  toolOutputHandler?: ToolOutputHandler;
  /** Context tracker — monitors token utilization and triggers compaction. */
  contextTracker?: ContextTracker;
  /** Called when context level changes (for status bar updates). */
  onContextUpdate?: (utilization: number, level: ContextLevel) => void;
}

/**
 * Creates an AgentRunner backed by the real LLM provider.
 * When tools are available, uses callLLMMultiTurn for the tool loop.
 * When no tools, uses callLLM for simple streaming.
 */
export function createLLMAgentRunner(opts: LLMAgentRunnerOptions = {}): AgentRunner {
  const {
    onToken, onToolCall, getToolSchemas, executeTool,
    doomLoopDetector, toolOutputHandler, contextTracker, onContextUpdate,
  } = opts;
  const injectionDetector = new InjectionDetector();

  return {
    async run(
      agentId: string,
      prompt: string,
      tools: string[],
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

      // Get tool schemas if available
      const toolDefs = (tools.length > 0 && getToolSchemas) ? getToolSchemas(tools) : [];
      const hasTools = toolDefs.length > 0 && executeTool;

      // Enhance system prompt with tool info and working directory
      let systemPrompt = context.systemPrompt;
      if (hasTools) {
        const toolList = toolDefs.map((t) => `- ${t.name}: ${t.description}`).join("\n");
        systemPrompt += `\n\nYou have access to the following tools:\n${toolList}\n\nThe current working directory is: ${process.cwd()}\nWhen the user asks you to read, analyze, or modify code, USE the file_read, file_list, and file_edit tools to access the codebase directly. Do NOT ask the user to paste code.`;
      }

      try {
        const allToolCalls: ToolCallSummary[] = [];

        if (hasTools) {
          // Multi-turn with tool loop
          const response = await callLLMMultiTurn({
            model: context.model,
            systemPrompt,
            userMessage: prompt,
            tools: toolDefs,
            handleTool: async (name, args) => {
              // Doom-loop detection: check before executing
              if (doomLoopDetector) {
                const verdict = doomLoopDetector.track(agentId, name, args);
                if (verdict.action === "block") {
                  onToolCall?.(agentId, name, "blocked");
                  allToolCalls.push({ tool: name, input: JSON.stringify(args), output: verdict.message, duration: 0, success: false });
                  return verdict.message;
                }
                // Warn verdict: we'll append the hint after getting the result
                if (verdict.action === "warn") {
                  onToolCall?.(agentId, name, "running");
                  try {
                    let result = await executeTool!(name, args);
                    const alerts = injectionDetector.detect(result, "tool_output");
                    if (alerts.some((a) => a.severity === "critical")) {
                      result = "[BLOCKED: suspicious content detected in tool output]";
                    }
                    if (toolOutputHandler && result.length > 4000) {
                      const summarized = await toolOutputHandler.processToolOutput(name, result);
                      result = summarized.content;
                    }
                    onToolCall?.(agentId, name, "completed");
                    allToolCalls.push({ tool: name, input: JSON.stringify(args), output: result.slice(0, 200), duration: 0, success: true });
                    return result + "\n\n" + verdict.message;
                  } catch (e) {
                    onToolCall?.(agentId, name, "failed");
                    const errMsg = e instanceof Error ? e.message : String(e);
                    allToolCalls.push({ tool: name, input: JSON.stringify(args), output: errMsg, duration: 0, success: false });
                    return `Error: ${errMsg}`;
                  }
                }
              }

              onToolCall?.(agentId, name, "running");
              try {
                let result = await executeTool!(name, args);

                // Scan tool output for injection attempts before sending to LLM
                const alerts = injectionDetector.detect(result, "tool_output");
                if (alerts.some((a) => a.severity === "critical")) {
                  result = "[BLOCKED: suspicious content detected in tool output]";
                }

                // Summarize large tool outputs
                if (toolOutputHandler && result.length > 4000) {
                  const summarized = await toolOutputHandler.processToolOutput(name, result);
                  result = summarized.content;
                }

                onToolCall?.(agentId, name, "completed");
                allToolCalls.push({ tool: name, input: JSON.stringify(args), output: result.slice(0, 200), duration: 0, success: true });
                return result;
              } catch (e) {
                onToolCall?.(agentId, name, "failed");
                const msg = e instanceof Error ? e.message : String(e);
                allToolCalls.push({ tool: name, input: JSON.stringify(args), output: msg, duration: 0, success: false });
                return `Error: ${msg}`;
              }
            },
            // Context compaction before each LLM turn
            beforeTurn: contextTracker ? async (messages: Message[]) => {
              const snapshot = contextTracker.snapshot(messages);
              onContextUpdate?.(snapshot.utilizationPercent, snapshot.level);
              if (contextTracker.shouldCompact(snapshot)) {
                await compact(messages, snapshot.level);
              }
            } : undefined,
            onChunk: (token) => onToken?.(agentId, token),
            onToolCall: (name) => onToolCall?.(agentId, name, "running"),
            onToolResult: (name) => onToolCall?.(agentId, name, "completed"),
            signal,
            maxTurns: 10,
          });

          return makeResult(agentId, true, response.text, undefined, response.usage, allToolCalls);
        }

        // Simple single-turn (no tools)
        const response = await callLLM(prompt, {
          model: context.model,
          systemPrompt,
          signal,
          onChunk: (token) => onToken?.(agentId, token),
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
  toolCalls?: ToolCallSummary[],
): AgentResult {
  return {
    agentId,
    success,
    response,
    toolCalls: toolCalls ?? [],
    duration: 0,
    inputTokens: usage?.input ?? 0,
    outputTokens: usage?.output ?? 0,
    costUSD: 0,
    error,
  };
}
