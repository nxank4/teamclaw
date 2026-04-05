/**
 * Detects and executes tool calls from LLM stream output.
 * Tool calls are text-based: ```tool_call\n{...}\n``` blocks.
 */

import { randomUUID } from "node:crypto";
import { Result, ok } from "neverthrow";
import type { ToolExecutor } from "../tools/executor.js";
import type { ToolExecutionContext } from "../tools/types.js";
import type { StreamEvent, LLMToolCall, LLMMessage, ToolCallRecord, StreamError } from "./types.js";

const TOOL_CALL_REGEX = /```tool_call\s*\n([\s\S]*?)```/g;

export interface ToolCallResult {
  callId: string;
  toolName: string;
  success: boolean;
  outputSummary: string;
  duration: number;
  responseMessage: LLMMessage;
}

export class ToolCallHandler {
  constructor(
    private toolExecutor: ToolExecutor,
    private emitEvent: (event: StreamEvent) => void,
  ) {}

  /**
   * Parse tool calls from accumulated LLM text.
   */
  parseToolCalls(text: string): LLMToolCall[] {
    const calls: LLMToolCall[] = [];
    let idx = 0;

    for (const m of text.matchAll(TOOL_CALL_REGEX)) {
      try {
        const parsed = JSON.parse(m[1]!.trim()) as { name?: string; input?: unknown };
        if (parsed.name && typeof parsed.name === "string") {
          calls.push({
            id: `call_${Date.now()}_${idx++}`,
            name: parsed.name,
            arguments: JSON.stringify(parsed.input ?? {}),
          });
        }
      } catch {
        // Malformed JSON — skip
      }
    }

    return calls;
  }

  /**
   * Strip tool_call blocks from text to get clean prose content.
   */
  stripToolCalls(text: string): string {
    return text.replace(TOOL_CALL_REGEX, "").trim();
  }

  /**
   * Execute tool calls and return results for LLM context.
   */
  async handleToolCalls(
    toolCalls: LLMToolCall[],
    context: ToolExecutionContext,
    sessionId: string,
  ): Promise<Result<ToolCallResult[], StreamError>> {
    const results: ToolCallResult[] = [];

    // Execute all tool calls (could parallelize in future)
    for (const call of toolCalls) {
      const executionId = randomUUID().slice(0, 8);
      let parsedArgs: unknown;

      try {
        parsedArgs = JSON.parse(call.arguments);
      } catch {
        results.push({
          callId: call.id,
          toolName: call.name,
          success: false,
          outputSummary: "Malformed tool call arguments",
          duration: 0,
          responseMessage: {
            role: "tool",
            content: "Error: malformed JSON arguments",
            toolCallId: call.id,
          },
        });
        continue;
      }

      // Emit start event
      this.emitEvent({
        type: "tool:start",
        sessionId,
        agentId: context.agentId,
        executionId,
        toolName: call.name,
        toolDisplayName: call.name,
        inputSummary: JSON.stringify(parsedArgs).slice(0, 100),
        timestamp: Date.now(),
      });

      // Execute
      const start = Date.now();
      const execResult = await this.toolExecutor.execute(
        call.name,
        parsedArgs,
        context,
      );
      const duration = Date.now() - start;

      if (execResult.isOk()) {
        const output = execResult.value;
        this.emitEvent({
          type: "tool:done",
          sessionId,
          agentId: context.agentId,
          executionId,
          toolName: call.name,
          success: true,
          outputSummary: output.summary,
          fullOutput: output.fullOutput,
          duration,
          timestamp: Date.now(),
        });

        results.push({
          callId: call.id,
          toolName: call.name,
          success: true,
          outputSummary: output.summary,
          duration,
          responseMessage: {
            role: "tool",
            content: output.summary,
            toolCallId: call.id,
          },
        });
      } else {
        const errMsg = `Tool error: ${execResult.error.type} — ${("cause" in execResult.error) ? execResult.error.cause : ""}`;
        this.emitEvent({
          type: "tool:done",
          sessionId,
          agentId: context.agentId,
          executionId,
          toolName: call.name,
          success: false,
          outputSummary: errMsg,
          duration,
          timestamp: Date.now(),
        });

        results.push({
          callId: call.id,
          toolName: call.name,
          success: false,
          outputSummary: errMsg,
          duration,
          responseMessage: {
            role: "tool",
            content: errMsg,
            toolCallId: call.id,
          },
        });
      }
    }

    return ok(results);
  }

  /**
   * Convert ToolCallResults to ToolCallRecords for the final result.
   */
  toRecords(results: ToolCallResult[]): ToolCallRecord[] {
    return results.map((r) => ({
      toolName: r.toolName,
      inputSummary: "",
      outputSummary: r.outputSummary,
      success: r.success,
      duration: r.duration,
    }));
  }
}
