/**
 * Auto-spec interview flow.
 *
 * Owns the state machine that runs when a complex prompt fires the
 * spec gate:
 *
 *   prompt → codebase scan → generate questions → ask one by one →
 *     all answered → draft spec → user reviews externally → /approve
 *     → repeat for plan → /approve → executing → dispatch
 *
 * The prompt-handler defers to {@link startAutoSpec},
 * {@link handlePendingInterviewAnswer}, and
 * {@link startPlanInterview} when the relevant pending state is set
 * on AppContext. All chat output goes through the supplied MsgCtx so
 * the integration tests can capture rendered messages without a TUI.
 *
 * Test seams live on {@link SpecPlanCommandDeps.interviewServices}.
 */

import { mkdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { writeFileAtomic } from "../utils/atomic-write.js";
import { scanForInterview } from "../spec/codebase-scan.js";
import {
  generateInterviewQuestions,
  generatePlanFromAnswers,
  generateSpecFromAnswers,
  InterviewLLMError,
  type AnsweredQuestion,
  type InterviewQuestion,
  type PendingInterview,
} from "../spec/interview.js";
import { generateSlug } from "../spec/slug-gen.js";
import { nextAvailableSlug } from "../spec/slug.js";
import { transition } from "../session/phase-machine.js";
import { joinFrontmatter } from "../utils/frontmatter.js";
import {
  INTERVIEW_MESSAGE_TAG,
  parseAnswer,
  renderQuestion,
} from "../tui/components/interview-prompt/index.js";
import { ICONS } from "../tui/constants/icons.js";
import { defaultTheme } from "../tui/themes/default.js";

import type { SpecPlanCommandDeps } from "./commands/spec.js";
import type { Session } from "../session/session.js";

export type MsgCtx = {
  addMessage: (role: string, content: string, options?: { tag?: string }) => void;
};

// ── Branded-box helper ───────────────────────────────────────────

/** Render a `┌ tag ├ ... └` block as a single multi-line string. */
export function renderBrandedBox(tag: string, lines: string[]): string {
  const tl = defaultTheme.primary("┌");
  const mid = defaultTheme.primary("├");
  const bl = defaultTheme.primary("└");
  const out = [`${tl} ${defaultTheme.muted(tag)}`];
  for (const line of lines) out.push(`${mid} ${line}`);
  out.push(bl);
  return out.join("\n");
}

// ── Services bundle resolution ───────────────────────────────────

interface ResolvedServices {
  scanCodebase: typeof scanForInterview;
  generateQuestions: typeof generateInterviewQuestions;
  generateSpec: typeof generateSpecFromAnswers;
  generatePlan: typeof generatePlanFromAnswers;
  generateSlug: typeof generateSlug;
}

function services(deps: SpecPlanCommandDeps): ResolvedServices {
  const s = deps.interviewServices ?? {};
  return {
    scanCodebase: s.scanCodebase ?? scanForInterview,
    generateQuestions: s.generateQuestions ?? generateInterviewQuestions,
    generateSpec: s.generateSpec ?? generateSpecFromAnswers,
    generatePlan: s.generatePlan ?? generatePlanFromAnswers,
    generateSlug: s.generateSlug ?? generateSlug,
  };
}

function projectRoot(deps: SpecPlanCommandDeps): string {
  return deps.getProjectRoot ? deps.getProjectRoot() : process.cwd();
}

// ── Phase-entry notice + question emission ───────────────────────

function emitSpecEntryNotice(ctx: MsgCtx, reasons: string[]): void {
  const reasonsText = reasons.length > 0 ? reasons.join(", ") : "complex prompt";
  ctx.addMessage(
    "system",
    renderBrandedBox("op:phase", [
      defaultTheme.primary(`${ICONS.bolt} Complex prompt detected (${reasonsText})`),
      "Scanning codebase to draft questions",
      defaultTheme.dim("/abandon to cancel · /skip to bypass spec gate"),
    ]),
    { tag: "op:phase" },
  );
}

function emitPlanEntryNotice(ctx: MsgCtx, specPath: string): void {
  ctx.addMessage(
    "system",
    renderBrandedBox("op:phase", [
      defaultTheme.primary(`${ICONS.success} Spec approved at ${specPath}`),
      "Scanning codebase to draft plan questions",
      defaultTheme.dim("/abandon to cancel"),
    ]),
    { tag: "op:phase" },
  );
}

function emitInterviewQuestion(
  ctx: MsgCtx,
  q: InterviewQuestion,
  currentIndex: number,
  total: number,
): void {
  const lines = renderQuestion(q, { current: currentIndex, total }, defaultTheme);
  ctx.addMessage("system", lines.join("\n"), { tag: INTERVIEW_MESSAGE_TAG });
}

function emitSpecDraftedNotice(ctx: MsgCtx, specPath: string): void {
  ctx.addMessage(
    "system",
    renderBrandedBox("op:spec", [
      defaultTheme.primary(`${ICONS.success} Drafted spec: ${specPath}`),
      "Open in your editor to review (code, vim, notepad, …)",
      defaultTheme.dim("Then /approve to continue · /revise to iterate · /abandon to cancel"),
    ]),
    { tag: "op:spec" },
  );
}

function emitPlanDraftedNotice(ctx: MsgCtx, planPath: string): void {
  ctx.addMessage(
    "system",
    renderBrandedBox("op:plan", [
      defaultTheme.primary(`${ICONS.success} Drafted plan: ${planPath}`),
      "Open in your editor to review",
      defaultTheme.dim("Then /approve to execute · /revise to iterate · /abandon to cancel"),
    ]),
    { tag: "op:plan" },
  );
}

// ── Entry: complex prompt → spec interview ───────────────────────

/**
 * Kick off the spec-phase interview. Runs the codebase scan, asks the
 * LLM for adaptive questions, sets `pendingInterview` on AppContext,
 * and surfaces the first question. Subsequent answers are picked up
 * by {@link handlePendingInterviewAnswer}.
 */
export async function startAutoSpec(
  prompt: string,
  session: Session,
  ctx: MsgCtx,
  deps: SpecPlanCommandDeps,
  reasons: string[],
): Promise<void> {
  emitSpecEntryNotice(ctx, reasons);

  const svc = services(deps);
  const codebaseContext = await svc.scanCodebase(prompt, projectRoot(deps));

  ctx.addMessage("system", `${ICONS.bolt} Drafting interview questions...`);

  let questions: InterviewQuestion[];
  try {
    questions = await svc.generateQuestions(prompt, codebaseContext);
  } catch (err) {
    const msg = err instanceof InterviewLLMError
      ? err.message
      : err instanceof Error ? err.message : String(err);
    ctx.addMessage("error", `Could not generate interview questions: ${msg}`);
    return;
  }

  const phase = session.getPhase().currentPhase;
  session.setPhase(transition(phase, "classifyComplex"), "classifyComplex");
  session.setPhase(transition("spec_required", "openSpec"), "openSpec");

  deps.appCtx.pendingInterview = {
    kind: "spec",
    questions,
    answers: [],
    currentIndex: 0,
    originalPrompt: prompt,
    codebaseContext,
  };

  emitInterviewQuestion(ctx, questions[0]!, 1, questions.length);
}

// ── Entry: spec approved → plan interview ────────────────────────

/**
 * Approve the current spec (frontmatter flip + phase transition) and
 * start the plan-phase interview. Called from
 * `handlePendingPhaseAnswer` on a "y" answer in spec_drafting.
 */
export async function startPlanInterview(
  specBody: string,
  specPath: string,
  originalPrompt: string,
  codebaseContext: PendingInterview extends { codebaseContext: infer C } ? C : never,
  session: Session,
  ctx: MsgCtx,
  deps: SpecPlanCommandDeps,
): Promise<void> {
  session.setPhase(transition(session.getPhase().currentPhase, "approveSpec"), "approveSpec");

  emitPlanEntryNotice(ctx, specPath);

  const svc = services(deps);
  // Reuse the previous codebase scan rather than re-walking the tree —
  // the spec just got approved so the project layout hasn't changed.
  ctx.addMessage("system", `${ICONS.bolt} Drafting plan questions...`);

  let questions: InterviewQuestion[];
  try {
    questions = await svc.generateQuestions(`Plan for: ${originalPrompt}`, codebaseContext);
  } catch (err) {
    const msg = err instanceof InterviewLLMError
      ? err.message
      : err instanceof Error ? err.message : String(err);
    ctx.addMessage("error", `Could not generate plan questions: ${msg}`);
    return;
  }

  session.setPhase(transition("spec_approved", "openPlan"), "openPlan");

  deps.appCtx.pendingInterview = {
    kind: "plan",
    questions,
    answers: [],
    currentIndex: 0,
    originalPrompt,
    codebaseContext,
    specPath,
    specBody,
  };

  emitInterviewQuestion(ctx, questions[0]!, 1, questions.length);
}

// ── Entry: user answered a pending interview question ────────────

/**
 * Consume the user's text reply to the current interview question.
 * Parse error → re-emit the same question with the error message.
 * Valid answer → push, advance, either emit next or finalize.
 */
export async function handlePendingInterviewAnswer(
  text: string,
  session: Session,
  ctx: MsgCtx,
  deps: SpecPlanCommandDeps,
): Promise<void> {
  const pending = deps.appCtx.pendingInterview;
  if (!pending) return;

  const q = pending.questions[pending.currentIndex];
  if (!q) {
    // Defensive: should never happen — we always finalize when index passes total.
    deps.appCtx.pendingInterview = null;
    return;
  }

  const parseResult = parseAnswer(text, q);
  if (!parseResult.ok) {
    ctx.addMessage("error", parseResult.error);
    // Stay on the same question.
    emitInterviewQuestion(ctx, q, pending.currentIndex + 1, pending.questions.length);
    return;
  }

  const answered: AnsweredQuestion = { question: q, answer: parseResult.answer };
  pending.answers.push(answered);
  pending.currentIndex++;

  if (pending.currentIndex < pending.questions.length) {
    const next = pending.questions[pending.currentIndex]!;
    emitInterviewQuestion(ctx, next, pending.currentIndex + 1, pending.questions.length);
    return;
  }

  await finalizeInterview(pending, session, ctx, deps);
}

// ── Finalisation: all questions answered ─────────────────────────

async function finalizeInterview(
  pending: PendingInterview,
  session: Session,
  ctx: MsgCtx,
  deps: SpecPlanCommandDeps,
): Promise<void> {
  const svc = services(deps);

  if (pending.kind === "spec") {
    ctx.addMessage("system", `${ICONS.bolt} Drafting spec...`);

    let body: string;
    let baseSlug: string;
    try {
      [baseSlug, body] = await Promise.all([
        svc.generateSlug(pending.originalPrompt),
        svc.generateSpec(pending.originalPrompt, pending.answers, pending.codebaseContext),
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.addMessage("error", `Could not draft spec: ${msg}`);
      return;
    }

    const specsDir = resolve(deps.getSpecsDir());
    await mkdir(specsDir, { recursive: true });
    const finalSlug = nextAvailableSlug(baseSlug, specsDir);
    const specPath = resolve(specsDir, `${finalSlug}.md`);
    await writeFileAtomic(specPath, buildSpec(finalSlug, body));

    session.setSpecPath(specPath);
    deps.appCtx.lastOpenedSpec = { slug: finalSlug, path: specPath };
    deps.appCtx.lastOpenedKind = "spec";
    deps.appCtx.pendingInterview = null;
    deps.appCtx.pendingPhaseConfirmation = {
      kind: "spec",
      specPath,
      originalPrompt: pending.originalPrompt,
      questions: pending.questions,
      answers: pending.answers,
      codebaseContext: pending.codebaseContext,
      specBody: body,
    };

    emitSpecDraftedNotice(ctx, specPath);
    return;
  }

  // plan branch
  ctx.addMessage("system", `${ICONS.bolt} Drafting plan...`);

  let body: string;
  try {
    body = await svc.generatePlan(
      pending.originalPrompt,
      pending.answers,
      pending.specBody,
      pending.codebaseContext,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.addMessage("error", `Could not draft plan: ${msg}`);
    return;
  }

  const plansDir = resolve(deps.getPlansDir());
  await mkdir(plansDir, { recursive: true });
  const linkedSlug = deps.appCtx.lastOpenedSpec?.slug ?? "plan";
  const planSlug = nextAvailableSlug(linkedSlug, plansDir);
  const planPath = resolve(plansDir, `${planSlug}.md`);
  const specRelative = relative(plansDir, pending.specPath);
  await writeFileAtomic(planPath, buildPlan(planSlug, specRelative, body));

  session.setPlanPath(planPath);
  deps.appCtx.lastOpenedPlan = { slug: planSlug, path: planPath };
  deps.appCtx.lastOpenedKind = "plan";
  deps.appCtx.pendingInterview = null;
  deps.appCtx.pendingPhaseConfirmation = {
    kind: "plan",
    specPath: pending.specPath,
    planPath,
    originalPrompt: pending.originalPrompt,
    questions: pending.questions,
    answers: pending.answers,
    codebaseContext: pending.codebaseContext,
    specBody: pending.specBody,
  };

  emitPlanDraftedNotice(ctx, planPath);
}

// ── File assembly ───────────────────────────────────────────────

function buildSpec(slug: string, body: string): string {
  const iso = new Date().toISOString();
  return joinFrontmatter(
    { slug, status: "draft", created: iso, last_updated: iso },
    body.trimEnd() + "\n",
  );
}

function buildPlan(slug: string, specPath: string, body: string): string {
  const iso = new Date().toISOString();
  return joinFrontmatter(
    { slug, status: "draft", created: iso, last_updated: iso, spec: specPath },
    body.trimEnd() + "\n",
  );
}

// ── /revise re-draft path ────────────────────────────────────────

/**
 * Re-draft the current spec or plan from the original interview
 * answers + appended free-text feedback. Called by the /revise slash
 * command (inline arg form) or the prompt-handler when the user
 * supplied feedback after a bare /revise.
 *
 * Returns true on success (file overwritten + pendingPhaseConfirmation
 * refreshed), false when no pending interview history is available to
 * redraft from.
 */
export async function reviseFromFeedback(
  feedback: string,
  session: Session,
  ctx: MsgCtx,
  deps: SpecPlanCommandDeps,
): Promise<boolean> {
  const pending = deps.appCtx.pendingPhaseConfirmation;
  if (!pending || !pending.questions || !pending.answers || !pending.codebaseContext) {
    ctx.addMessage(
      "error",
      "No interview history to revise from. /revise needs a recently drafted spec or plan.",
    );
    return false;
  }

  const feedbackEntry: AnsweredQuestion = {
    question: {
      id: "revise-feedback",
      question: "Feedback from the user on the previous draft",
      type: "free_text",
      allowCustomInput: true,
    },
    answer: { questionId: "revise-feedback", kind: "text", text: feedback },
  };
  const answers = [...pending.answers, feedbackEntry];

  const svc = services(deps);
  ctx.addMessage("system", `${ICONS.bolt} Revising ${pending.kind}...`);

  if (pending.kind === "spec") {
    let body: string;
    try {
      body = await svc.generateSpec(pending.originalPrompt, answers, pending.codebaseContext);
    } catch (err) {
      ctx.addMessage("error", `Could not revise spec: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
    const slug = deps.appCtx.lastOpenedSpec?.slug ?? "spec";
    await writeFileAtomic(pending.specPath, buildSpec(slug, body));
    // Refresh pending state with the new spec body + appended answers.
    deps.appCtx.pendingPhaseConfirmation = { ...pending, answers, specBody: body };
    emitSpecDraftedNotice(ctx, pending.specPath);
    return true;
  }

  // plan branch
  if (!pending.planPath || !pending.specBody) {
    ctx.addMessage("error", "Plan path or spec body missing — cannot revise.");
    return false;
  }
  let body: string;
  try {
    body = await svc.generatePlan(
      pending.originalPrompt,
      answers,
      pending.specBody,
      pending.codebaseContext,
    );
  } catch (err) {
    ctx.addMessage("error", `Could not revise plan: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
  const slug = deps.appCtx.lastOpenedPlan?.slug ?? "plan";
  const specRelative = relative(resolve(deps.getPlansDir()), pending.specPath);
  await writeFileAtomic(pending.planPath, buildPlan(slug, specRelative, body));
  deps.appCtx.pendingPhaseConfirmation = { ...pending, answers };
  emitPlanDraftedNotice(ctx, pending.planPath);

  // Silence unused-arg warning on session: the parameter is kept for
  // symmetry with startAutoSpec/startPlanInterview and future use.
  void session;
  return true;
}
