import { describe, expect, it } from "bun:test";

import {
  allowedTriggers,
  emptyPhaseBlock,
  isTerminal,
  PhaseTransitionError,
  transition,
  type Phase,
  type PhaseTrigger,
} from "../../src/session/phase-machine.js";

const LEGAL: Array<[Phase, PhaseTrigger, Phase]> = [
  ["idle", "classifyComplex", "spec_required"],
  ["idle", "abandon", "abandoned"],
  ["spec_required", "openSpec", "spec_drafting"],
  ["spec_required", "abandon", "abandoned"],
  ["spec_drafting", "approveSpec", "spec_approved"],
  ["spec_drafting", "abandon", "abandoned"],
  ["spec_approved", "openPlan", "plan_drafting"],
  ["spec_approved", "abandon", "abandoned"],
  ["plan_drafting", "approvePlan", "plan_approved"],
  ["plan_drafting", "abandon", "abandoned"],
  ["plan_approved", "startExecute", "executing"],
  ["plan_approved", "abandon", "abandoned"],
  ["executing", "finish", "done"],
  ["executing", "revise", "plan_drafting"],
  ["executing", "abandon", "abandoned"],
];

describe("phase-machine: transition", () => {
  for (const [from, trigger, to] of LEGAL) {
    it(`${from} + ${trigger} → ${to}`, () => {
      expect(transition(from, trigger)).toBe(to);
    });
  }
});

describe("phase-machine: illegal transitions throw", () => {
  it("idle + approveSpec is illegal", () => {
    let caught: unknown;
    try { transition("idle", "approveSpec"); } catch (err) { caught = err; }
    expect(caught).toBeInstanceOf(PhaseTransitionError);
  });

  it("done is terminal — no triggers allowed", () => {
    for (const trigger of ["classifyComplex", "openSpec", "abandon", "finish", "revise"] as PhaseTrigger[]) {
      let caught: unknown;
      try { transition("done", trigger); } catch (err) { caught = err; }
      expect(caught).toBeInstanceOf(PhaseTransitionError);
    }
  });

  it("abandoned is terminal — no triggers allowed", () => {
    let caught: unknown;
    try { transition("abandoned", "classifyComplex"); } catch (err) { caught = err; }
    expect(caught).toBeInstanceOf(PhaseTransitionError);
  });

  it("error message includes currentPhase, trigger, and allowed list", () => {
    let caught: PhaseTransitionError | null = null;
    try {
      transition("idle", "startExecute");
    } catch (err) {
      caught = err as PhaseTransitionError;
    }
    expect(caught).not.toBeNull();
    expect(caught!.currentPhase).toBe("idle");
    expect(caught!.trigger).toBe("startExecute");
    expect(caught!.allowedTriggers).toEqual(["classifyComplex", "abandon"]);
    expect(caught!.message).toContain("from phase 'idle'");
    expect(caught!.message).toContain("'startExecute'");
    expect(caught!.message).toContain("classifyComplex");
    expect(caught!.message).toContain("abandon");
  });

  it("error message for terminal state mentions terminal status", () => {
    let caught: PhaseTransitionError | null = null;
    try { transition("done", "revise"); } catch (err) { caught = err as PhaseTransitionError; }
    expect(caught!.message).toContain("terminal");
  });
});

describe("phase-machine: allowedTriggers + isTerminal", () => {
  it("idle allows classifyComplex + abandon", () => {
    expect(allowedTriggers("idle").sort()).toEqual(["abandon", "classifyComplex"]);
  });

  it("executing allows finish + revise + abandon", () => {
    expect(allowedTriggers("executing").sort()).toEqual(["abandon", "finish", "revise"]);
  });

  it("terminal states return empty allowed list", () => {
    expect(allowedTriggers("done")).toEqual([]);
    expect(allowedTriggers("abandoned")).toEqual([]);
  });

  it("isTerminal distinguishes terminal from non-terminal", () => {
    expect(isTerminal("done")).toBe(true);
    expect(isTerminal("abandoned")).toBe(true);
    expect(isTerminal("idle")).toBe(false);
    expect(isTerminal("executing")).toBe(false);
  });
});

describe("phase-machine: emptyPhaseBlock", () => {
  it("starts at idle with empty history and null paths", () => {
    const block = emptyPhaseBlock();
    expect(block.currentPhase).toBe("idle");
    expect(block.currentSpecPath).toBeNull();
    expect(block.currentPlanPath).toBeNull();
    expect(block.history).toEqual([]);
  });
});
