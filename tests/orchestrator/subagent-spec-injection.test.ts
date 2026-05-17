import { describe, expect, it } from "bun:test";

import { __buildSystemPrompt } from "../../src/orchestrator/subagent-runner.js";
import { WriteLockManager } from "../../src/orchestrator/write-lock.js";
import type { RunSubagentArgs } from "../../src/orchestrator/subagent-runner.js";
import type { AgentDefinition } from "../../src/orchestrator/types.js";

const AGENT: AgentDefinition = {
  id: "builder",
  name: "Builder",
  description: "Builder agent for tests",
  prompt: "You are the Builder. Implement code from the plan.",
  tools: ["Read", "Edit"],
};

function makeArgs(overrides: Partial<RunSubagentArgs> = {}): RunSubagentArgs {
  return {
    agent_def: AGENT,
    prompt: "do the thing",
    artifact_reader: null,
    depth: 0,
    parent_agent_id: null,
    write_lock_manager: new WriteLockManager(),
    session_id: "sid",
    ...overrides,
  };
}

describe("subagent system-prompt — spec/plan injection", () => {
  it("emits no spec/plan block when neither is supplied", () => {
    const out = __buildSystemPrompt(makeArgs());
    expect(out).not.toContain("## Approved Specification");
    expect(out).not.toContain("## Approved Plan");
    expect(out).not.toContain("Implement strictly");
  });

  it("injects only the spec section when approvedSpec is supplied", () => {
    const out = __buildSystemPrompt(makeArgs({ approvedSpec: "spec body content" }));
    expect(out).toContain("## Approved Specification");
    expect(out).toContain("spec body content");
    expect(out).not.toContain("## Approved Plan");
    expect(out).toContain("Implement strictly according to the approved spec and plan");
  });

  it("injects only the plan section when approvedPlan is supplied", () => {
    const out = __buildSystemPrompt(makeArgs({ approvedPlan: "plan body content" }));
    expect(out).not.toContain("## Approved Specification");
    expect(out).toContain("## Approved Plan");
    expect(out).toContain("plan body content");
  });

  it("injects both sections when spec + plan are supplied", () => {
    const out = __buildSystemPrompt(
      makeArgs({ approvedSpec: "SPEC", approvedPlan: "PLAN" }),
    );
    const specIdx = out.indexOf("## Approved Specification");
    const planIdx = out.indexOf("## Approved Plan");
    expect(specIdx).toBeGreaterThan(-1);
    expect(planIdx).toBeGreaterThan(-1);
    expect(specIdx).toBeLessThan(planIdx);
    expect(out).toContain("SPEC");
    expect(out).toContain("PLAN");
  });

  it("places the spec/plan block AFTER the agent prompt body and BEFORE the agent metadata", () => {
    const out = __buildSystemPrompt(makeArgs({ approvedSpec: "S", approvedPlan: "P" }));
    const promptIdx = out.indexOf("You are the Builder");
    const specIdx = out.indexOf("## Approved Specification");
    const agentMetaIdx = out.indexOf("You are agent 'builder'");
    expect(promptIdx).toBeGreaterThan(-1);
    expect(specIdx).toBeGreaterThan(promptIdx);
    expect(agentMetaIdx).toBeGreaterThan(specIdx);
  });
});
