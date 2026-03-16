/**
 * Composition gate wrapper for graph nodes.
 * Bypasses a node when the agent role is not in the active composition.
 */

import type { GraphState } from "../../core/graph-state.js";
import type { AgentRole, ActiveAgent } from "./types.js";

/**
 * Wraps a graph node function with a composition gate.
 * If teamComposition exists and the role is not in activeAgents, the node
 * returns a no-op (pass-through). If no composition is set (manual mode),
 * the node runs normally.
 */
export function withCompositionGate(
  nodeName: string,
  agentRole: AgentRole,
  nodeFunction: (state: GraphState) => Promise<Partial<GraphState>>,
): (state: GraphState) => Promise<Partial<GraphState>> {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    const composition = state.teamComposition as { activeAgents?: ActiveAgent[] } | null;

    // No composition = manual mode — always run the node
    if (!composition) {
      return nodeFunction(state);
    }

    const activeAgents = composition.activeAgents ?? [];
    const isActive = activeAgents.some((a) => a.role === agentRole);

    if (!isActive) {
      return { __node__: nodeName };
    }

    return nodeFunction(state);
  };
}
