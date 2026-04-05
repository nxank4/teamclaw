/**
 * Resolves PromptIntent + MentionParseResult into a concrete RouteDecision.
 * Decides which agent(s) handle the task, dispatch strategy, and tool assignment.
 */

import { Result, ok, err } from "neverthrow";
import type {
  PromptIntent,
  MentionParseResult,
  RouteDecision,
  AgentAssignment,
  RouterError,
} from "./router-types.js";
import { AgentRegistry } from "./agent-registry.js";

export interface ResolverContext {
  activeAgents?: string[];
  lastAgentId?: string;
}

export class AgentResolver {
  constructor(private registry: AgentRegistry) {}

  resolve(
    intent: PromptIntent,
    mentions: MentionParseResult,
    context?: ResolverContext,
  ): Result<RouteDecision, RouterError> {
    // 1. Explicit mentions override everything
    if (mentions.hasExplicitRouting) {
      return this.resolveFromMentions(mentions);
    }

    // 2. Config → handled internally, no agent dispatch
    if (intent.category === "config") {
      return ok({
        strategy: "single",
        agents: [],
        requiresConfirmation: false,
      });
    }

    // 3. Unknown → clarify
    if (intent.category === "unknown") {
      return ok({
        strategy: "clarify",
        agents: [],
        requiresConfirmation: false,
      });
    }

    // 4. Conversation continuity
    if (
      intent.category === "conversation" &&
      context?.lastAgentId &&
      intent.confidence >= 0.5
    ) {
      const lastAgent = this.registry.get(context.lastAgentId);
      if (lastAgent) {
        return ok({
          strategy: "single",
          agents: [this.makeAssignment(lastAgent.id, lastAgent.name, "", lastAgent.defaultTools, 0)],
          requiresConfirmation: false,
        });
      }
    }

    // 5. Intent-based routing
    const agents = this.registry.findByIntent(intent.category);
    if (agents.length === 0) {
      // Fallback to assistant
      const assistant = this.registry.get("assistant");
      if (!assistant) {
        return err({ type: "no_agents_available", message: "No agents available for this task" });
      }
      return ok({
        strategy: "single",
        agents: [this.makeAssignment(assistant.id, assistant.name, "", assistant.defaultTools, 0)],
        requiresConfirmation: false,
      });
    }

    // 6. Multi-step → orchestrated
    if (intent.category === "multi_step") {
      return this.resolveOrchestrated(intent);
    }

    // 7. Single agent route
    const primary = agents[0]!;
    const tools = this.resolveTools(primary.defaultTools, intent.requiresTools);

    let strategy: RouteDecision["strategy"] = "single";
    let requiresConfirmation = false;

    // 8. Complexity escalation
    if (intent.complexity === "complex") {
      strategy = "orchestrated";
      requiresConfirmation = true;
    }

    return ok({
      strategy,
      agents: [this.makeAssignment(primary.id, primary.name, "", tools, 0)],
      requiresConfirmation,
    });
  }

  private resolveFromMentions(mentions: MentionParseResult): Result<RouteDecision, RouterError> {
    const assignments: AgentAssignment[] = [];

    for (let i = 0; i < mentions.mentions.length; i++) {
      const m = mentions.mentions[i]!;
      const agent = this.registry.get(m.agentId);
      if (!agent) {
        return err({ type: "agent_not_found", agentId: m.agentId });
      }

      assignments.push(
        this.makeAssignment(
          agent.id,
          agent.name,
          m.task ?? mentions.cleanedPrompt,
          agent.defaultTools,
          i,
          i > 0 ? [assignments[i - 1]!.agentId] : undefined,
        ),
      );
    }

    const strategy = assignments.length === 1 ? "single" : "sequential";

    return ok({
      strategy,
      agents: assignments,
      requiresConfirmation: false,
    });
  }

  private resolveOrchestrated(_intent: PromptIntent): Result<RouteDecision, RouterError> {
    const planner = this.registry.get("planner");
    if (!planner) {
      return err({ type: "no_agents_available", message: "Planner agent not available for orchestration" });
    }

    return ok({
      strategy: "orchestrated",
      agents: [this.makeAssignment(planner.id, planner.name, "", planner.defaultTools, 0)],
      plan: "Planner will decompose the task, then sub-tasks will be dispatched individually.",
      requiresConfirmation: true,
    });
  }

  private resolveTools(defaultTools: string[], requiredTools: string[]): string[] {
    const tools = new Set(defaultTools);
    for (const t of requiredTools) {
      tools.add(t);
    }
    return [...tools];
  }

  private makeAssignment(
    agentId: string,
    role: string,
    task: string,
    tools: string[],
    priority: number,
    dependsOn?: string[],
  ): AgentAssignment {
    return { agentId, role, task, tools, priority, dependsOn };
  }
}
