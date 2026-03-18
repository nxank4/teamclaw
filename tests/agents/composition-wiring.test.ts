import { describe, it, expect, vi } from "vitest";
import { withCompositionGate } from "@/agents/composition/wiring.js";
import type { GraphState } from "@/core/graph-state.js";

function makeState(overrides: Partial<GraphState> = {}): GraphState {
  return {
    cycle_count: 0,
    session_active: true,
    last_action: "",
    messages: [],
    last_quality_score: 0,
    death_reason: null,
    generation_id: 1,
    ancestral_lessons: [],
    team: [],
    agent_messages: [],
    user_goal: null,
    project_context: "",
    task_queue: [],
    bot_stats: {},
    approval_pending: null,
    approval_response: null,
    __node__: null,
    planning_document: null,
    architecture_document: null,
    rfc_document: null,
    deep_work_mode: false,
    last_pulse_timestamp: 0,
    pulse_interval_ms: 30_000,
    mid_sprint_reported: false,
    total_tasks: 0,
    completed_tasks: 0,
    parallelism_depth: 0,
    retrieved_memories: "",
    preferences_context: "",
    preview: null,
    aborted: false,
    skip_preview: false,
    average_confidence: 0,
    low_confidence_tasks: [],
    confidence_history: [],
    next_sprint_backlog: [],
    approval_stats: {},
    memory_context: {},
    new_success_patterns: [],
    learning_curve: null,
    global_memory_context: {},
    promoted_this_run: [],
    agent_profiles: [],
    routing_decisions: [],
    profile_alerts: [],
    teamComposition: null,
    compositionOverrides: [],
    _send_task: null,
    _send_bot_id: "",
    ...overrides,
  } as GraphState;
}

describe("withCompositionGate", () => {
  const mockNode = vi.fn(async () => ({
    planning_document: "Sprint plan created",
    __node__: "sprint_planning",
  }));

  it("runs the node when no composition is set (manual mode)", async () => {
    const gated = withCompositionGate("sprint_planning", "sprint_planning", mockNode);
    const state = makeState({ teamComposition: null });
    const result = await gated(state);
    expect(mockNode).toHaveBeenCalledWith(state);
    expect(result.planning_document).toBe("Sprint plan created");
  });

  it("runs the node when the role is in activeAgents", async () => {
    mockNode.mockClear();
    const gated = withCompositionGate("sprint_planning", "sprint_planning", mockNode);
    const state = makeState({
      teamComposition: {
        activeAgents: [
          { role: "sprint_planning", reason: "Goal matches", confidence: 0.8 },
          { role: "coordinator", reason: "Required", confidence: 1.0 },
        ],
      } as unknown as Record<string, unknown>,
    });
    const result = await gated(state);
    expect(mockNode).toHaveBeenCalled();
    expect(result.planning_document).toBe("Sprint plan created");
  });

  it("bypasses the node when the role is not in activeAgents", async () => {
    mockNode.mockClear();
    const gated = withCompositionGate("sprint_planning", "sprint_planning", mockNode);
    const state = makeState({
      teamComposition: {
        activeAgents: [
          { role: "coordinator", reason: "Required", confidence: 1.0 },
        ],
      } as unknown as Record<string, unknown>,
    });
    const result = await gated(state);
    expect(mockNode).not.toHaveBeenCalled();
    expect(result).toEqual({ __node__: "sprint_planning" });
  });

  it("bypasses the node when activeAgents is empty", async () => {
    mockNode.mockClear();
    const gated = withCompositionGate("rfc_phase", "rfc_phase", mockNode);
    const state = makeState({
      teamComposition: { activeAgents: [] } as unknown as Record<string, unknown>,
    });
    const result = await gated(state);
    expect(mockNode).not.toHaveBeenCalled();
    expect(result).toEqual({ __node__: "rfc_phase" });
  });

  it("works with different node names and roles", async () => {
    mockNode.mockClear();
    const gated = withCompositionGate("system_design", "system_design", mockNode);
    const state = makeState({
      teamComposition: {
        activeAgents: [
          { role: "system_design", reason: "Architecture needed", confidence: 0.7 },
        ],
      } as unknown as Record<string, unknown>,
    });
    await gated(state);
    expect(mockNode).toHaveBeenCalled();
  });
});
