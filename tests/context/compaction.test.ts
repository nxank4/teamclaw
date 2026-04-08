import { describe, it, expect } from "vitest";
import { compact, type CompactableMessage } from "../../src/context/compaction.js";

/** Helper to create a message. */
function msg(role: CompactableMessage["role"], content: string, extra?: Partial<CompactableMessage>): CompactableMessage {
  return { role, content, ...extra };
}

/** Build a realistic conversation with N user/assistant exchanges + tool calls. */
function buildConversation(exchangeCount: number): CompactableMessage[] {
  const messages: CompactableMessage[] = [
    msg("system", "You are a helpful assistant."),
  ];

  for (let i = 0; i < exchangeCount; i++) {
    messages.push(msg("user", `User message ${i}: ${"context ".repeat(50)}`));
    messages.push(msg("tool", `Tool result ${i}: ${"output data ".repeat(100)}`, {
      toolCallId: `call_${i}`,
      metadata: { toolName: `tool_${i}` },
    }));
    messages.push(msg("assistant", `Assistant response ${i}: ${"explanation ".repeat(80)}`));
  }

  return messages;
}

describe("compact", () => {
  describe("no-op levels", () => {
    it("returns null for normal level", async () => {
      const messages = buildConversation(5);
      const result = await compact(messages, "normal");
      expect(result).toBeNull();
    });

    it("returns null for warning level", async () => {
      const messages = buildConversation(5);
      const result = await compact(messages, "warning");
      expect(result).toBeNull();
    });
  });

  describe("tool_mask strategy (high)", () => {
    it("masks old tool results", async () => {
      const messages = buildConversation(15);
      const originalLength = messages.length;

      const result = await compact(messages, "high", { keepLastExchanges: 5 });

      expect(result).not.toBeNull();
      expect(result!.strategy).toBe("tool_mask");
      expect(result!.messagesAffected).toBeGreaterThan(0);
      // Message count unchanged (masking, not removing)
      expect(messages.length).toBe(originalLength);
    });

    it("preserves tool messages within last N exchanges", async () => {
      const messages = buildConversation(15);

      await compact(messages, "high", { keepLastExchanges: 5 });

      // Last 5 exchanges' tool results should still have real content
      const lastToolMessages = messages
        .filter((m) => m.role === "tool")
        .slice(-5);

      for (const m of lastToolMessages) {
        expect(m.content).not.toContain("[Tool:");
      }
    });

    it("masked messages still have toolCallId", async () => {
      const messages = buildConversation(15);

      await compact(messages, "high", { keepLastExchanges: 5 });

      const masked = messages.filter((m) => m.content.includes("[Tool:"));
      expect(masked.length).toBeGreaterThan(0);
      // Original messages had toolCallId — masking preserves the object, only changes content
      for (const m of masked) {
        expect(m.toolCallId).toBeDefined();
      }
    });

    it("reduces token count", async () => {
      const messages = buildConversation(15);

      const result = await compact(messages, "high", { keepLastExchanges: 5 });

      expect(result!.afterTokens).toBeLessThan(result!.beforeTokens);
    });
  });

  describe("prune strategy (critical)", () => {
    it("removes old tool and system messages", async () => {
      const messages = buildConversation(15);
      const originalLength = messages.length;

      const result = await compact(messages, "critical", { keepLastExchanges: 5 });

      expect(result).not.toBeNull();
      expect(result!.strategy).toBe("prune");
      expect(messages.length).toBeLessThan(originalLength);
    });

    it("keeps original system prompt at index 0", async () => {
      const messages = buildConversation(15);

      await compact(messages, "critical", { keepLastExchanges: 5 });

      expect(messages[0]!.role).toBe("system");
      expect(messages[0]!.content).toBe("You are a helpful assistant.");
    });

    it("truncates long user messages to 200 chars", async () => {
      const messages = buildConversation(15);

      await compact(messages, "critical", { keepLastExchanges: 5 });

      // Find user messages that were in the "old" zone
      const earlyUserMsgs = messages.filter(
        (m) => m.role === "user" && m.content.includes("[...truncated]"),
      );
      for (const m of earlyUserMsgs) {
        expect(m.content.length).toBeLessThan(220);
      }
    });

    it("reduces token count", async () => {
      const messages = buildConversation(15);

      const result = await compact(messages, "critical", { keepLastExchanges: 5 });

      expect(result!.afterTokens).toBeLessThan(result!.beforeTokens);
    });
  });

  describe("llm_summarize strategy (emergency)", () => {
    it("replaces history with summary + tail", async () => {
      const messages = buildConversation(15);
      const mockSummary = "Summary: User asked about files. Agent read and modified src/index.ts.";

      const result = await compact(messages, "emergency", {
        callLLM: async () => mockSummary,
        emergencyKeepLast: 3,
      });

      expect(result).not.toBeNull();
      expect(result!.strategy).toBe("llm_summarize");

      // First message should be the summary
      expect(messages[0]!.role).toBe("system");
      expect(messages[0]!.content).toContain("Conversation Summary");
      expect(messages[0]!.content).toContain(mockSummary);
    });

    it("keeps last N exchanges verbatim", async () => {
      const messages = buildConversation(10);
      const lastUserMsg = messages.filter((m) => m.role === "user").at(-1)!.content;

      await compact(messages, "emergency", {
        callLLM: async () => "summary",
        emergencyKeepLast: 3,
      });

      // Last user message should be preserved verbatim
      const userMsgs = messages.filter((m) => m.role === "user");
      expect(userMsgs.at(-1)!.content).toBe(lastUserMsg);
    });

    it("falls back to pruning if no callLLM provided", async () => {
      const messages = buildConversation(15);

      const result = await compact(messages, "emergency");

      expect(result).not.toBeNull();
      expect(result!.strategy).toBe("prune");
    });

    it("reduces token count significantly", async () => {
      const messages = buildConversation(15);

      const result = await compact(messages, "emergency", {
        callLLM: async () => "Brief summary of the conversation.",
        emergencyKeepLast: 3,
      });

      expect(result!.afterTokens).toBeLessThan(result!.beforeTokens * 0.5);
    });
  });

  describe("edge cases", () => {
    it("handles conversation with fewer exchanges than keepLast", async () => {
      const messages = buildConversation(3);
      const originalLength = messages.length;

      const result = await compact(messages, "high", { keepLastExchanges: 10 });

      // Nothing to compact — cutoff is 0
      expect(result!.messagesAffected).toBe(0);
      expect(messages.length).toBe(originalLength);
    });

    it("handles empty messages array", async () => {
      const messages: CompactableMessage[] = [];

      const result = await compact(messages, "high");

      expect(result!.messagesAffected).toBe(0);
    });
  });
});
