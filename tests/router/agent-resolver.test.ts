import { describe, it, expect, beforeEach } from "vitest";
import { AgentResolver } from "../../src/router/agent-resolver.js";
import { AgentRegistry } from "../../src/router/agent-registry.js";
import type { PromptIntent, MentionParseResult } from "../../src/router/router-types.js";

function makeIntent(overrides: Partial<PromptIntent> = {}): PromptIntent {
  return {
    category: "conversation",
    confidence: 0.9,
    complexity: "simple",
    requiresTools: [],
    suggestedAgents: [],
    reasoning: "test",
    ...overrides,
  };
}

function makeNoMentions(): MentionParseResult {
  return { mentions: [], cleanedPrompt: "test prompt", hasExplicitRouting: false };
}

function makeMention(agentId: string, task?: string): MentionParseResult {
  return {
    mentions: [{ agentId, raw: `@${agentId}`, position: 0, task }],
    cleanedPrompt: task ?? "test prompt",
    hasExplicitRouting: true,
  };
}

function makeMultiMentions(agents: Array<{ id: string; task?: string }>): MentionParseResult {
  return {
    mentions: agents.map((a, i) => ({
      agentId: a.id,
      raw: `@${a.id}`,
      position: i * 20,
      task: a.task,
    })),
    cleanedPrompt: "test prompt",
    hasExplicitRouting: true,
  };
}

describe("AgentResolver", () => {
  let registry: AgentRegistry;
  let resolver: AgentResolver;

  beforeEach(() => {
    registry = new AgentRegistry();
    resolver = new AgentResolver(registry);
  });

  it("explicit @mention overrides intent-based routing", () => {
    const result = resolver.resolve(
      makeIntent({ category: "conversation" }), // intent says conversation
      makeMention("coder", "write code"), // but user explicitly mentioned coder
    );
    expect(result.isOk()).toBe(true);
    const decision = result._unsafeUnwrap();
    expect(decision.strategy).toBe("single");
    expect(decision.agents[0]!.agentId).toBe("coder");
  });

  it("multiple @mentions produce sequential strategy", () => {
    const result = resolver.resolve(
      makeIntent(),
      makeMultiMentions([
        { id: "coder", task: "write code" },
        { id: "reviewer", task: "review it" },
      ]),
    );
    expect(result.isOk()).toBe(true);
    const decision = result._unsafeUnwrap();
    expect(decision.strategy).toBe("sequential");
    expect(decision.agents).toHaveLength(2);
    expect(decision.agents[0]!.agentId).toBe("coder");
    expect(decision.agents[1]!.agentId).toBe("reviewer");
    expect(decision.agents[1]!.dependsOn).toEqual(["coder"]);
  });

  it("code_write intent routes to coder", () => {
    const result = resolver.resolve(makeIntent({ category: "code_write" }), makeNoMentions());
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().agents[0]!.agentId).toBe("coder");
  });

  it("code_review intent routes to reviewer", () => {
    const result = resolver.resolve(makeIntent({ category: "code_review" }), makeNoMentions());
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().agents[0]!.agentId).toBe("reviewer");
  });

  it("conversation routes to assistant", () => {
    const result = resolver.resolve(
      makeIntent({ category: "conversation", confidence: 0.4 }), // low confidence → no continuity
      makeNoMentions(),
    );
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().agents[0]!.agentId).toBe("assistant");
  });

  it("conversation continuity: follow-up routes to last agent", () => {
    const result = resolver.resolve(
      makeIntent({ category: "conversation", confidence: 0.9 }),
      makeNoMentions(),
      { lastAgentId: "coder" },
    );
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().agents[0]!.agentId).toBe("coder");
  });

  it("multi_step intent produces orchestrated strategy", () => {
    const result = resolver.resolve(
      makeIntent({ category: "multi_step" }),
      makeNoMentions(),
    );
    expect(result.isOk()).toBe(true);
    const decision = result._unsafeUnwrap();
    expect(decision.strategy).toBe("orchestrated");
    expect(decision.requiresConfirmation).toBe(true);
  });

  it("unknown intent produces clarify strategy", () => {
    const result = resolver.resolve(
      makeIntent({ category: "unknown" }),
      makeNoMentions(),
    );
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().strategy).toBe("clarify");
  });

  it("complex + single agent escalates to orchestrated", () => {
    const result = resolver.resolve(
      makeIntent({ category: "code_write", complexity: "complex" }),
      makeNoMentions(),
    );
    expect(result.isOk()).toBe(true);
    const decision = result._unsafeUnwrap();
    expect(decision.strategy).toBe("orchestrated");
    expect(decision.requiresConfirmation).toBe(true);
  });

  it("config intent returns no agent (internal handling)", () => {
    const result = resolver.resolve(
      makeIntent({ category: "config" }),
      makeNoMentions(),
    );
    expect(result.isOk()).toBe(true);
    const decision = result._unsafeUnwrap();
    expect(decision.agents).toHaveLength(0);
  });

  it("missing agent returns agent_not_found error", () => {
    const result = resolver.resolve(
      makeIntent(),
      {
        mentions: [{ agentId: "nonexistent", raw: "@nonexistent", position: 0 }],
        cleanedPrompt: "test",
        hasExplicitRouting: true,
      },
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("agent_not_found");
    }
  });

  it("tools from intent are merged with agent defaults", () => {
    const result = resolver.resolve(
      makeIntent({ category: "code_write", requiresTools: ["web_search", "custom_tool"] }),
      makeNoMentions(),
    );
    expect(result.isOk()).toBe(true);
    const tools = result._unsafeUnwrap().agents[0]!.tools;
    expect(tools).toContain("file_read");    // from coder defaults
    expect(tools).toContain("web_search");   // from intent
    expect(tools).toContain("custom_tool");  // from intent
  });
});
