/**
 * Interview module — LLM-driven question generation and spec/plan
 * drafting that grounds itself in a {@link CodebaseContext} from
 * `codebase-scan.ts`.
 *
 * Flow:
 *   prompt + codebase scan
 *     → generateInterviewQuestions  (LLM call, adaptive 3-15)
 *     → user answers each via the TUI interview-prompt component
 *     → generateSpecFromAnswers     (LLM call → spec markdown)
 *     → ... user reviews and /approve
 *     → generatePlanFromAnswers     (LLM call → plan markdown)
 *
 * All LLM calls go through {@link callLLM}; tests use the
 * `llmCall` seam on each Options bag to inject canned responses.
 */

import { z } from "zod";

import { callLLM } from "../engine/llm.js";
import { debugLog } from "../debug/logger.js";
import { safeJsonParse } from "../utils/safe-json-parse.js";

import type { CodebaseContext } from "./codebase-scan.js";

// ── Question schema ──────────────────────────────────────────────

export const interviewOptionSchema = z.object({
  label: z.string().min(1),
  description: z.string().optional(),
});

export const interviewQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  type: z.enum(["single_select", "multi_select", "free_text"]),
  options: z.array(interviewOptionSchema).optional(),
  allowCustomInput: z.boolean().default(true),
  rationale: z.string().optional(),
});

export type InterviewOption = z.infer<typeof interviewOptionSchema>;
export type InterviewQuestion = z.infer<typeof interviewQuestionSchema>;

export const interviewResponseSchema = z.object({
  questions: z.array(interviewQuestionSchema).min(1),
});

export type InterviewResponse = z.infer<typeof interviewResponseSchema>;

// ── Answer shape ─────────────────────────────────────────────────

/**
 * One user-supplied answer to an InterviewQuestion. Discriminated by
 * `kind`:
 *   options — user picked one or more numbered options from a select
 *             question. selectedIndices is 0-based.
 *   text    — user typed a free-text answer (either because the
 *             question was free_text, or they overrode the options
 *             via allowCustomInput).
 *   skip    — user typed "skip" / pressed Esc; the spec generator
 *             will substitute a safe default and note it under the
 *             "## Assumptions" section.
 */
export type InterviewAnswer =
  | { questionId: string; kind: "options"; selectedIndices: number[] }
  | { questionId: string; kind: "text"; text: string }
  | { questionId: string; kind: "skip" };

// ── Interview-in-progress state (carried on AppContext) ─────────

/**
 * Discriminated by `kind`. Tracks an in-progress interview between
 * user turns: the question list, the user's answers so far, and the
 * cursor pointing at the next unanswered question.
 *
 *   kind: "spec"
 *     The interview drives the spec phase. No spec on disk yet —
 *     finalisation will draft the spec, write it, and set
 *     pendingPhaseConfirmation { kind: "spec" }.
 *
 *   kind: "plan"
 *     The spec is already drafted + approved (specPath, specBody).
 *     Finalisation drafts the plan, writes it, and sets
 *     pendingPhaseConfirmation { kind: "plan", planPath }.
 */
export type PendingInterview =
  | {
      kind: "spec";
      questions: InterviewQuestion[];
      answers: AnsweredQuestion[];
      currentIndex: number;
      originalPrompt: string;
      codebaseContext: import("./codebase-scan.js").CodebaseContext;
    }
  | {
      kind: "plan";
      questions: InterviewQuestion[];
      answers: AnsweredQuestion[];
      currentIndex: number;
      originalPrompt: string;
      codebaseContext: import("./codebase-scan.js").CodebaseContext;
      specPath: string;
      specBody: string;
    };

// ── Bounds + filler questions ────────────────────────────────────

export const MIN_QUESTIONS = 3;
export const MAX_QUESTIONS = 15;

/**
 * Free-text questions used to pad a < MIN_QUESTIONS LLM response up
 * to the floor. Each id is unique so the pad step never inserts a
 * duplicate of the model's own output.
 */
const FILLER_QUESTIONS: ReadonlyArray<InterviewQuestion> = [
  {
    id: "filler-constraints",
    question: "Any constraints or no-go zones I should respect (timeline, tech stack, files-not-to-touch)?",
    type: "free_text",
    allowCustomInput: true,
    rationale: "Surfaces blockers and out-of-scope areas before the spec is drafted.",
  },
  {
    id: "filler-success",
    question: "What does success look like — how will you know this is done?",
    type: "free_text",
    allowCustomInput: true,
    rationale: "Pins acceptance criteria so the plan can map tasks to verifiable outcomes.",
  },
  {
    id: "filler-context",
    question: "Anything else I should know about this task that wasn't covered above?",
    type: "free_text",
    allowCustomInput: true,
    rationale: "Catches context the model didn't think to ask for.",
  },
];

/**
 * Clamp the question list into the [MIN_QUESTIONS, MAX_QUESTIONS]
 * window. Over-cap → slice from the head (keep the most important).
 * Under-floor → append generic free-text fillers without duplicating
 * ids the LLM already produced.
 */
export function clampQuestionCount(qs: InterviewQuestion[]): InterviewQuestion[] {
  if (qs.length > MAX_QUESTIONS) {
    debugLog("warn", "llm", "interview_too_many", {
      data: { count: qs.length, clampedTo: MAX_QUESTIONS },
    });
    return qs.slice(0, MAX_QUESTIONS);
  }
  if (qs.length < MIN_QUESTIONS) {
    debugLog("warn", "llm", "interview_too_few", {
      data: { count: qs.length, paddedTo: MIN_QUESTIONS },
    });
    const result = [...qs];
    for (const filler of FILLER_QUESTIONS) {
      if (result.length >= MIN_QUESTIONS) break;
      if (!result.some((q) => q.id === filler.id)) result.push(filler);
    }
    return result;
  }
  return qs;
}

// ── Error shape ──────────────────────────────────────────────────

export class InterviewLLMError extends Error {
  constructor(message: string, readonly raw?: string) {
    super(message);
    this.name = "InterviewLLMError";
  }
}

// ── Codebase context formatting ──────────────────────────────────

/**
 * Render a {@link CodebaseContext} as a markdown block to be embedded
 * in the LLM prompt. Trims missing sections so an empty context
 * produces empty output (instead of a forest of empty headers).
 */
export function formatCodebaseContext(ctx: CodebaseContext): string {
  const parts: string[] = [];
  if (ctx.fileTree.trim() !== "") {
    parts.push("### Project structure\n```\n" + ctx.fileTree + "\n```");
  }
  if (ctx.conventions.trim() !== "") {
    parts.push("### Project conventions\n```\n" + ctx.conventions + "\n```");
  }
  if (ctx.keyFiles.length > 0) {
    const fileBlocks = ctx.keyFiles.map(
      (f) => `**${f.path}**\n\`\`\`\n${f.excerpt}\n\`\`\``,
    );
    parts.push("### Relevant files\n" + fileBlocks.join("\n\n"));
  }
  if (ctx.truncated) {
    parts.push("(Note: codebase scan was truncated by budget; some files may be missing.)");
  }
  return parts.join("\n\n");
}

// ── Prompt builders (exported for tests) ─────────────────────────

export const QUESTION_SYSTEM_PROMPT = [
  "You are a senior engineer interviewing a user about a feature they want built.",
  "Goal: surface enough detail so a separate implementer can build the feature without further clarification.",
  "",
  "Generate between 3 and 15 questions. Choose the count adaptively:",
  "- vague verbs like 'refactor', 'improve', 'clean up' → MORE questions (scope is wide open)",
  "- specific verbs like 'add field X to type Y', 'fix null check at line N' → FEWER questions",
  "- many files likely affected → MORE questions",
  "- conventions clearly documented in CLAUDE.md / AGENTS.md → FEWER questions",
  "- conventions missing or inconsistent → MORE questions",
  "",
  "Output a JSON object exactly matching this TypeScript type:",
  "",
  "  type InterviewQuestion = {",
  "    id: string;                  // stable kebab-case id, unique within this question set",
  "    question: string;            // the question itself",
  "    type: 'single_select' | 'multi_select' | 'free_text';",
  "    options?: { label: string; description?: string }[];  // required iff type !== 'free_text'; 2-5 items",
  "    allowCustomInput: boolean;   // usually true so the user can override",
  "    rationale?: string;          // 1 sentence on WHY this question matters",
  "  };",
  "",
  "  type Response = { questions: InterviewQuestion[] };",
  "",
  "Rules:",
  "- output ONLY the JSON object. No markdown fences, no prose.",
  "- always include a rationale.",
  "- options should be concrete and grounded in the codebase context (real file paths, real type names) when relevant.",
  "- never invent files or symbols that aren't in the context.",
].join("\n");

export function buildQuestionUserPrompt(
  userPrompt: string,
  ctx: CodebaseContext,
): string {
  const ctxBlock = formatCodebaseContext(ctx);
  const parts = [
    "## User prompt",
    userPrompt,
  ];
  if (ctxBlock !== "") {
    parts.push("");
    parts.push("## Codebase context");
    parts.push(ctxBlock);
  }
  parts.push("");
  parts.push("Generate the interview questions now. Return JSON only.");
  return parts.join("\n");
}

export const SPEC_SYSTEM_PROMPT = [
  "You are drafting a feature spec markdown for a user.",
  "You will receive: the user's original prompt, codebase context, and the user's answers to a set of interview questions.",
  "",
  "Output ONLY the markdown body of the spec — no frontmatter, no fences around the body, no preamble. Headings must follow this skeleton:",
  "",
  "  ## Summary",
  "  ## Goals",
  "  ## Non-goals",
  "  ## Approach",
  "  ## Open questions",
  "  ## Assumptions",
  "",
  "Rules:",
  "- The Assumptions section must list any question the user answered 'skip', stating the default you applied. If no skips, leave the section empty (just the heading).",
  "- Concrete file paths, type names, and function names from the codebase context are preferred over abstract descriptions.",
  "- Do not invent files or symbols that weren't in the context.",
  "- No prose outside the headings.",
].join("\n");

export function buildSpecUserPrompt(
  userPrompt: string,
  answers: AnsweredQuestion[],
  ctx: CodebaseContext,
): string {
  const ctxBlock = formatCodebaseContext(ctx);
  const answerBlock = formatAnswers(answers);
  const parts = [
    "## User prompt",
    userPrompt,
    "",
    "## Interview answers",
    answerBlock,
  ];
  if (ctxBlock !== "") {
    parts.push("");
    parts.push("## Codebase context");
    parts.push(ctxBlock);
  }
  parts.push("");
  parts.push("Draft the spec body now. Markdown only, no frontmatter.");
  return parts.join("\n");
}

export const PLAN_SYSTEM_PROMPT = [
  "You are drafting an implementation plan markdown for an approved feature spec.",
  "You will receive: the user's original prompt, codebase context, interview answers, and the approved spec body.",
  "",
  "Output ONLY the markdown body of the plan — no frontmatter, no fences around the body, no preamble. Headings must follow this skeleton:",
  "",
  "  ## Tasks",
  "  ## Risks",
  "  ## Verification",
  "",
  "Rules:",
  "- The Tasks section is a checkbox list (`- [ ] description`).",
  "- Order tasks so each one is independently testable.",
  "- Reference concrete files/symbols from the codebase context when possible.",
  "- Do not invent files or symbols that weren't in the context.",
  "- No prose outside the headings.",
].join("\n");

export function buildPlanUserPrompt(
  userPrompt: string,
  answers: AnsweredQuestion[],
  specBody: string,
  ctx: CodebaseContext,
): string {
  const ctxBlock = formatCodebaseContext(ctx);
  const answerBlock = formatAnswers(answers);
  const parts = [
    "## User prompt",
    userPrompt,
    "",
    "## Approved spec",
    specBody,
    "",
    "## Interview answers",
    answerBlock,
  ];
  if (ctxBlock !== "") {
    parts.push("");
    parts.push("## Codebase context");
    parts.push(ctxBlock);
  }
  parts.push("");
  parts.push("Draft the plan body now. Markdown only, no frontmatter.");
  return parts.join("\n");
}

// ── Answer formatting ────────────────────────────────────────────

/**
 * Pair an answer with the question it was answering. The interview
 * driver collects these before calling generateSpecFromAnswers /
 * generatePlanFromAnswers — those calls need both pieces (label text
 * for selected options, and the question prose itself) to produce a
 * useful LLM prompt.
 */
export interface AnsweredQuestion {
  question: InterviewQuestion;
  answer: InterviewAnswer;
}

/** Render the user's interview answers as a flat markdown bullet list. */
export function formatAnswers(items: AnsweredQuestion[]): string {
  if (items.length === 0) return "(no answers recorded)";
  const lines: string[] = [];
  for (const { question, answer } of items) {
    lines.push(`- **${question.question}**`);
    if (answer.kind === "skip") {
      lines.push("  - _skipped — apply a safe default and note it under Assumptions._");
      continue;
    }
    if (answer.kind === "text") {
      lines.push(`  - ${answer.text}`);
      continue;
    }
    // options
    const opts = question.options ?? [];
    const picked = answer.selectedIndices.map((idx) => {
      const opt = opts[idx];
      return opt ? opt.label : `option #${idx + 1}`;
    });
    lines.push(`  - ${picked.join("; ")}`);
  }
  return lines.join("\n");
}

// ── Public entry points ──────────────────────────────────────────

export interface GenerateInterviewQuestionsOptions {
  /**
   * Test seam — override the LLM call. Receives `(userPrompt, systemPrompt)`
   * and returns the model's raw text. Defaults to a wrapper around callLLM.
   */
  llmCall?: (userPrompt: string, systemPrompt: string) => Promise<string>;
  /** Forwarded to callLLM. */
  signal?: AbortSignal;
}

/**
 * Generate a list of interview questions, validated and clamped to
 * [MIN_QUESTIONS, MAX_QUESTIONS]. Throws InterviewLLMError when the
 * model output cannot be parsed or doesn't match the schema — the
 * caller decides whether to retry, fall back, or surface to the user.
 */
export async function generateInterviewQuestions(
  userPrompt: string,
  ctx: CodebaseContext,
  options: GenerateInterviewQuestionsOptions = {},
): Promise<InterviewQuestion[]> {
  const callImpl = options.llmCall ?? defaultLLMCall(options.signal);
  const raw = await callImpl(buildQuestionUserPrompt(userPrompt, ctx), QUESTION_SYSTEM_PROMPT);

  const parsed = safeJsonParse<unknown>(raw);
  if (!parsed.parsed) {
    throw new InterviewLLMError(`Failed to parse interview JSON: ${parsed.error}`, raw);
  }
  const validated = interviewResponseSchema.safeParse(parsed.data);
  if (!validated.success) {
    throw new InterviewLLMError(
      `Interview JSON did not match schema: ${validated.error.message}`,
      raw,
    );
  }
  validateSelectQuestionsHaveOptions(validated.data.questions);
  return clampQuestionCount(validated.data.questions);
}

/**
 * Single-select and multi-select questions must carry an `options`
 * array; the zod schema marks it optional because free_text questions
 * legitimately omit it. Enforce the conditional invariant here.
 */
function validateSelectQuestionsHaveOptions(qs: InterviewQuestion[]): void {
  for (const q of qs) {
    if (q.type === "free_text") continue;
    if (!q.options || q.options.length === 0) {
      throw new InterviewLLMError(
        `Question '${q.id}' is type '${q.type}' but has no options`,
      );
    }
  }
}

export type GenerateSpecOptions = GenerateInterviewQuestionsOptions;

/**
 * Produce the markdown body of a spec (no frontmatter) by asking the
 * LLM to fill the spec skeleton from the user's answers + context.
 * Returns the raw text trimmed; the caller wraps with frontmatter
 * via the existing template helpers.
 */
export async function generateSpecFromAnswers(
  userPrompt: string,
  answers: AnsweredQuestion[],
  ctx: CodebaseContext,
  options: GenerateSpecOptions = {},
): Promise<string> {
  const callImpl = options.llmCall ?? defaultLLMCall(options.signal);
  const raw = await callImpl(buildSpecUserPrompt(userPrompt, answers, ctx), SPEC_SYSTEM_PROMPT);
  return raw.trim();
}

export type GeneratePlanOptions = GenerateInterviewQuestionsOptions;

/**
 * Produce the markdown body of a plan (no frontmatter) given an
 * approved spec body, the original prompt, the user's plan-phase
 * interview answers, and the codebase context.
 */
export async function generatePlanFromAnswers(
  userPrompt: string,
  answers: AnsweredQuestion[],
  specBody: string,
  ctx: CodebaseContext,
  options: GeneratePlanOptions = {},
): Promise<string> {
  const callImpl = options.llmCall ?? defaultLLMCall(options.signal);
  const raw = await callImpl(buildPlanUserPrompt(userPrompt, answers, specBody, ctx), PLAN_SYSTEM_PROMPT);
  return raw.trim();
}

/**
 * Default implementation of the (userPrompt, systemPrompt) → text
 * call used when callers don't pass a `llmCall` seam. Lifted into a
 * factory so the signal can be threaded through without re-binding
 * for each entry point.
 */
function defaultLLMCall(signal: AbortSignal | undefined):
  (userPrompt: string, systemPrompt: string) => Promise<string> {
  return async (userPrompt: string, systemPrompt: string): Promise<string> => {
    const response = await callLLM(userPrompt, {
      systemPrompt,
      source: "spec-interview",
      signal,
    });
    return response.text;
  };
}
