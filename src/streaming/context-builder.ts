/**
 * Builds complete LLM message array for agent calls.
 * Combines system prompt + session history + tools + user prompt.
 */

import { Result, ok, err } from "neverthrow";
import type { ToolRegistry } from "../tools/registry.js";
import type { LLMToolSchema } from "../tools/types.js";
import type { Session } from "../session/session.js";
import type { LLMMessage, StreamError } from "./types.js";

export interface BuiltContext {
  messages: LLMMessage[];
  toolSchemas: LLMToolSchema[];
  estimatedTokens: number;
  compressionApplied: boolean;
}

export class ContextBuilder {
  constructor(private toolRegistry: ToolRegistry) {}

  build(options: {
    session: Session;
    agentId: string;
    agentSystemPrompt: string;
    prompt: string;
    tools: string[];
    maxContextTokens?: number;
    includeHistory?: boolean;
    additionalContext?: string;
  }): Result<BuiltContext, StreamError> {
    try {
      const messages: LLMMessage[] = [];
      const maxTokens = options.maxContextTokens ?? 100_000;

      // 1. System message
      let systemContent = options.agentSystemPrompt || `You are ${options.agentId}, an AI assistant.`;

      // Append tool descriptions to system prompt
      const toolSchemas = this.toolRegistry.exportForLLM(options.tools);
      if (toolSchemas.length > 0) {
        systemContent += "\n\n## Available Tools\n\n";
        systemContent += "To use a tool, respond with a tool_call block:\n\n";
        systemContent += "```tool_call\n{\"name\": \"tool_name\", \"input\": {\"param\": \"value\"}}\n```\n\n";
        systemContent += "You can make multiple tool calls in a single response. ";
        systemContent += "After each tool call, you will receive the result and can continue.\n\n";
        systemContent += "When done, respond with your final answer as plain text.\n\n";

        for (const schema of toolSchemas) {
          systemContent += `### ${schema.name}\n${schema.description}\n`;
          if (schema.parameters && typeof schema.parameters === "object") {
            const props = (schema.parameters as Record<string, unknown>).properties;
            if (props && typeof props === "object") {
              systemContent += "Parameters: " + Object.keys(props as Record<string, unknown>).join(", ") + "\n";
            }
          }
          systemContent += "\n";
        }
      }

      messages.push({ role: "system", content: systemContent });

      // 2. Session history (if enabled)
      if (options.includeHistory !== false) {
        const historyMessages = options.session.buildContextMessages(maxTokens);
        for (const msg of historyMessages) {
          if (msg.role === "system") continue; // Skip session system messages
          messages.push({
            role: msg.role as LLMMessage["role"],
            content: msg.content,
          });
        }
      }

      // 3. Additional context (for sequential dispatch)
      if (options.additionalContext) {
        messages.push({
          role: "user",
          content: `Previous agent output:\n${options.additionalContext}`,
        });
      }

      // 4. Current prompt
      messages.push({ role: "user", content: options.prompt });

      // 5. Token estimation
      const estimatedTokens = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);

      if (estimatedTokens > maxTokens) {
        return err({
          type: "context_too_large",
          estimatedTokens,
          maxTokens,
        });
      }

      return ok({
        messages,
        toolSchemas,
        estimatedTokens,
        compressionApplied: false,
      });
    } catch (e) {
      return err({ type: "serialization_error", cause: String(e) });
    }
  }
}
