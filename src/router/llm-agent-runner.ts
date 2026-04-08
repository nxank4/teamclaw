/**
 * LLM Agent Runner — bridges Dispatcher's AgentRunner interface to the real LLM.
 * Uses callLLMMultiTurn for tool loop: LLM can call tools, get results, continue.
 * Streams tokens in real-time via onToken callback.
 */
import type { AgentRunner } from "./dispatch-strategy.js";
import type { AgentResult, ToolCallSummary } from "./router-types.js";
import { callLLM, callLLMMultiTurn, type ToolDef } from "../engine/llm.js";
import { InjectionDetector } from "../security/injection-detector.js";
import { getProjectContext } from "../context/project-context.js";

export interface ToolCallDetails {
  executionId: string;
  inputSummary?: string;
  duration?: number;
  outputSummary?: string;
  success?: boolean;
}

export interface LLMAgentRunnerOptions {
  onToken?: (agentId: string, token: string) => void;
  onToolCall?: (agentId: string, toolName: string, status: string, details?: ToolCallDetails) => void;
  /** Get tool schemas for an agent's tool list. */
  getToolSchemas?: (toolNames: string[]) => ToolDef[];
  /** Execute a tool and return the result as a string. */
  executeTool?: (toolName: string, args: Record<string, unknown>) => Promise<string>;
}

/**
 * Creates an AgentRunner backed by the real LLM provider.
 * When tools are available, uses callLLMMultiTurn for the tool loop.
 * When no tools, uses callLLM for simple streaming.
 */
export function createLLMAgentRunner(opts: LLMAgentRunnerOptions = {}): AgentRunner {
  const { onToken, onToolCall, getToolSchemas, executeTool } = opts;
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

      // Enhance system prompt with project context, tool info, and working directory
      let systemPrompt = context.systemPrompt;

      // Inject project context (CLAUDE.md / README.md + detected project type)
      const projectContext = getProjectContext(process.cwd());
      if (projectContext) {
        systemPrompt += projectContext;
      }

      if (hasTools) {
        const toolList = toolDefs.map((t) => `- ${t.name}: ${t.description}`).join("\n");
        systemPrompt += `\n\nYou have access to the following tools:\n${toolList}\n\nThe current working directory is: ${process.cwd()}\nWhen the user asks you to read, analyze, or modify code, USE the file_read, file_list, and file_edit tools to access the codebase directly. Do NOT ask the user to paste code.`;
      }

      try {
        const allToolCalls: ToolCallSummary[] = [];
        let toolCallCounter = 0;

        if (hasTools) {
          // Multi-turn with tool loop
          const response = await callLLMMultiTurn({
            model: context.model,
            systemPrompt,
            userMessage: prompt,
            tools: toolDefs,
            handleTool: async (name, args) => {
              const execId = `tc_${++toolCallCounter}`;
              const inputSummary = formatInputSummary(name, args);
              const startTime = Date.now();
              onToolCall?.(agentId, name, "running", { executionId: execId, inputSummary });
              try {
                let result = await executeTool!(name, args);

                // Scan tool output for injection attempts before sending to LLM
                const alerts = injectionDetector.detect(result, "tool_output");
                if (alerts.some((a) => a.severity === "critical")) {
                  result = "[BLOCKED: suspicious content detected in tool output]";
                }

                const duration = Date.now() - startTime;
                onToolCall?.(agentId, name, "completed", { executionId: execId, duration, outputSummary: result.slice(0, 200), success: true });
                allToolCalls.push({ tool: name, input: JSON.stringify(args), output: result.slice(0, 200), duration, success: true });
                return result;
              } catch (e) {
                const duration = Date.now() - startTime;
                const msg = e instanceof Error ? e.message : String(e);
                onToolCall?.(agentId, name, "failed", { executionId: execId, duration, outputSummary: msg, success: false });
                allToolCalls.push({ tool: name, input: JSON.stringify(args), output: msg, duration, success: false });
                return `Error: ${msg}`;
              }
            },
            onChunk: (token) => onToken?.(agentId, token),
            // Tool status is already emitted by handleTool above — don't duplicate
            onToolCall: undefined,
            onToolResult: undefined,
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

function formatInputSummary(toolName: string, args: Record<string, unknown>): string {
  const path = args.path ?? args.file_path;
  if (typeof path === "string") return path;
  const command = args.command;
  if (typeof command === "string") return command.length > 50 ? command.slice(0, 47) + "..." : command;
  const pattern = args.pattern ?? args.query;
  if (typeof pattern === "string") return `"${pattern.length > 40 ? pattern.slice(0, 37) + "..." : pattern}"`;
  const url = args.url;
  if (typeof url === "string") return url.length > 50 ? url.slice(0, 47) + "..." : url;
  const keys = Object.keys(args);
  if (keys.length === 0) return "";
  const first = args[keys[0]!];
  if (typeof first === "string") return first.length > 50 ? first.slice(0, 47) + "..." : first;
  return JSON.stringify(args).slice(0, 50);
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
