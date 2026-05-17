import { describe, expect, it } from "bun:test";

import { dispatch } from "../../src/orchestrator/dispatcher.js";
import { emptyPhaseBlock, type Phase } from "../../src/session/phase-machine.js";
import type { AgentRegistry } from "../../src/agents/registry/markdown-registry.js";

/**
 * Minimal registry stub: returns one made-up agent so the dispatcher's
 * "no chosen agents" branch doesn't fire (which would also return
 * `executed` but with an empty result, masking the gate). The gate
 * fires BEFORE registry resolution, so the stub just has to satisfy
 * the type contract.
 */
function stubRegistry(): AgentRegistry {
  return {
    all: () => [],
    get: () => null,
    fallback: () => null,
    loadErrors: () => [],
  } as unknown as AgentRegistry;
}

const BASE_ARGS = {
  task: "anything",
  registry: stubRegistry(),
  sessionId: "test-session",
  executeTool: async () => ({ text: "" }),
  forceKeyword: true,
};

describe("orchestrator dispatcher: phase gate", () => {
  const NON_EXECUTING: Phase[] = [
    "idle",
    "spec_required",
    "spec_drafting",
    "spec_approved",
    "plan_drafting",
    "plan_approved",
    "done",
    "abandoned",
  ];

  for (const p of NON_EXECUTING) {
    it(`blocks dispatch when phase is '${p}'`, async () => {
      const phase = { ...emptyPhaseBlock(), currentPhase: p };
      const outcome = await dispatch({ ...BASE_ARGS, phase });
      expect(outcome.kind).toBe("blocked");
      if (outcome.kind === "blocked") {
        expect(outcome.reason).toBe("phase_gate");
        expect(outcome.currentPhase).toBe(p);
        expect(outcome.message).toContain(p);
      }
    });
  }

  it("allows dispatch when phase is 'executing'", async () => {
    const phase = { ...emptyPhaseBlock(), currentPhase: "executing" as const };
    const outcome = await dispatch({ ...BASE_ARGS, phase });
    // The registry stub returns no candidates → executed branch with
    // empty agentResults. The point of the test is that the gate did
    // NOT block.
    expect(outcome.kind).toBe("executed");
  });

  it("bypasses the gate entirely when no phase arg is supplied", async () => {
    const outcome = await dispatch({ ...BASE_ARGS });
    expect(outcome.kind).toBe("executed");
  });
});
