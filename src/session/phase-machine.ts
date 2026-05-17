/**
 * Spec/plan execution phase state machine.
 *
 * Pure module — no fs, no logging, no dependencies on Session, AppContext,
 * or the orchestrator. The caller owns side effects (persisting state,
 * rendering the status bar, opening editors). This file only answers the
 * question "given my current phase and the trigger I want to apply, is
 * the transition valid, and if so what's the next phase?"
 *
 * Phases:
 *   idle           — no spec/plan flow active. Trivial prompts dispatch directly.
 *   spec_required  — classifier flagged the prompt as complex; spec is needed.
 *   spec_drafting  — spec file open in editor.
 *   spec_approved  — spec frontmatter is "approved"; ready to open plan.
 *   plan_drafting  — plan file open in editor.
 *   plan_approved  — plan frontmatter is "approved"; ready to dispatch.
 *   executing      — dispatcher gate is open; subagents may run.
 *   done           — terminal: dispatch completed.
 *   abandoned      — terminal: user gave up. Spec/plan files keep status=abandoned.
 *
 * Triggers from each phase (anything else → PhaseTransitionError):
 *   idle:            classifyComplex, abandon
 *   spec_required:   openSpec, abandon
 *   spec_drafting:   approveSpec, abandon
 *   spec_approved:   openPlan, abandon
 *   plan_drafting:   approvePlan, abandon
 *   plan_approved:   startExecute, abandon
 *   executing:       finish, revise, abandon
 *   done:            (terminal)
 *   abandoned:       (terminal)
 *
 * Note: `revise` from executing returns to plan_drafting and PRESERVES
 * spec_approved — the user revisits the plan, not the spec.
 */

export type Phase =
  | "idle"
  | "spec_required"
  | "spec_drafting"
  | "spec_approved"
  | "plan_drafting"
  | "plan_approved"
  | "executing"
  | "done"
  | "abandoned";

export type PhaseTrigger =
  | "classifyComplex"
  | "openSpec"
  | "approveSpec"
  | "openPlan"
  | "approvePlan"
  | "startExecute"
  | "revise"
  | "finish"
  | "abandon";

const TRANSITIONS: Record<Phase, Partial<Record<PhaseTrigger, Phase>>> = {
  idle: {
    classifyComplex: "spec_required",
    abandon: "abandoned",
  },
  spec_required: {
    openSpec: "spec_drafting",
    abandon: "abandoned",
  },
  spec_drafting: {
    approveSpec: "spec_approved",
    abandon: "abandoned",
  },
  spec_approved: {
    openPlan: "plan_drafting",
    abandon: "abandoned",
  },
  plan_drafting: {
    approvePlan: "plan_approved",
    abandon: "abandoned",
  },
  plan_approved: {
    startExecute: "executing",
    abandon: "abandoned",
  },
  executing: {
    finish: "done",
    revise: "plan_drafting",
    abandon: "abandoned",
  },
  done: {},
  abandoned: {},
};

export class PhaseTransitionError extends Error {
  constructor(
    public readonly currentPhase: Phase,
    public readonly trigger: PhaseTrigger,
    public readonly allowedTriggers: PhaseTrigger[],
  ) {
    const allowedDisplay = allowedTriggers.length > 0
      ? allowedTriggers.join(", ")
      : "(terminal — no transitions)";
    super(
      `Cannot apply trigger '${trigger}' from phase '${currentPhase}'. Allowed: [${allowedDisplay}]`,
    );
    this.name = "PhaseTransitionError";
  }
}

/** List the triggers that can fire from `phase`. Empty for terminal states. */
export function allowedTriggers(phase: Phase): PhaseTrigger[] {
  return Object.keys(TRANSITIONS[phase]) as PhaseTrigger[];
}

/**
 * Apply `trigger` to `currentPhase`. Returns the next phase on success;
 * throws {@link PhaseTransitionError} when the transition is illegal.
 */
export function transition(currentPhase: Phase, trigger: PhaseTrigger): Phase {
  const next = TRANSITIONS[currentPhase][trigger];
  if (!next) {
    throw new PhaseTransitionError(currentPhase, trigger, allowedTriggers(currentPhase));
  }
  return next;
}

/** True for `done` and `abandoned`. */
export function isTerminal(phase: Phase): boolean {
  return phase === "done" || phase === "abandoned";
}

/**
 * Per-session phase block persisted on SessionState. The history array
 * captures every transition for observability — `/phase` reads it to
 * show the user a timeline.
 */
export interface PhaseHistoryEntry {
  phase: Phase;
  at: string;
  trigger: PhaseTrigger;
}

export interface PhaseBlock {
  currentPhase: Phase;
  currentSpecPath: string | null;
  currentPlanPath: string | null;
  history: PhaseHistoryEntry[];
}

export function emptyPhaseBlock(): PhaseBlock {
  return {
    currentPhase: "idle",
    currentSpecPath: null,
    currentPlanPath: null,
    history: [],
  };
}
