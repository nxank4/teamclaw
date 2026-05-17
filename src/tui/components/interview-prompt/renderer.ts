/**
 * Renderer for an interactive interview question shown in the chat
 * stream. Pairs with `parser.ts` — the renderer emits the question,
 * the parser reads the user's reply.
 *
 * The output is a list of pre-styled lines a caller can push as a
 * system message tagged {@link INTERVIEW_MESSAGE_TAG}. Matches the
 * branded-box pattern from `compact-summary.ts` so the user can tell
 * at a glance that this is a structured prompt, not regular chat.
 *
 * Color rules:
 *   - box-drawing chars + tag label + question text → theme.primary
 *   - rationale line (1-sentence "why this question") → theme.dim
 *   - option numbers (1., 2., …)                      → theme.accent
 *   - option labels                                    → theme.primary
 *   - option descriptions (sub-text under a label)    → theme.dim
 *   - input hints + skip / abandon footer             → theme.dim
 */

import type { Theme } from "../../themes/theme.js";
import type { InterviewQuestion } from "../../../spec/interview.js";

/** Chat-message tag used by the prompt-handler when pushing a question. */
export const INTERVIEW_MESSAGE_TAG = "op:interview";

export interface QuestionPosition {
  /** 1-based index of the current question. */
  current: number;
  /**
   * Total questions in the set as the LLM produced them. The phrase
   * "Question N of M" shown to the user; when the model adapts mid-
   * interview the prompt-handler may also pass {@link estimated} = true
   * to indicate the count can grow.
   */
  total: number;
  /** When true, the header reads "Question N of ~M" to flag a soft total. */
  estimated?: boolean;
}

/**
 * Build the pre-styled lines for an interview question message.
 * The caller pushes them as a single system message tagged
 * {@link INTERVIEW_MESSAGE_TAG}; the message component honours the
 * embedded newlines and renders them as a multi-line bubble.
 */
export function renderQuestion(
  q: InterviewQuestion,
  position: QuestionPosition,
  theme: Theme,
): string[] {
  const lines: string[] = [];

  const tl = theme.primary("┌");
  const mid = theme.primary("├");
  const vert = theme.primary("│");
  const bl = theme.primary("└");

  const totalText = position.estimated ? `~${position.total}` : `${position.total}`;
  const header = `${INTERVIEW_MESSAGE_TAG} · Question ${position.current} of ${totalText}`;
  lines.push(`${tl} ${theme.muted(header)}`);
  lines.push(`${mid} ${theme.primary(q.question)}`);

  if (q.rationale && q.rationale.trim() !== "") {
    lines.push(`${vert} ${theme.dim(`─ ${q.rationale}`)}`);
  }

  if (q.type !== "free_text") {
    const options = q.options ?? [];
    if (options.length > 0) {
      lines.push(`${vert}`);
      for (let i = 0; i < options.length; i++) {
        const opt = options[i]!;
        const numLabel = `${i + 1}.`;
        const labelText = `${theme.accent(numLabel)} ${theme.primary(opt.label)}`;
        lines.push(`${vert}   ${labelText}`);
        if (opt.description && opt.description.trim() !== "") {
          lines.push(`${vert}      ${theme.dim(opt.description)}`);
        }
      }
    }
  }

  lines.push(`${vert}`);
  lines.push(`${vert} ${theme.dim(answerHintFor(q))}`);
  lines.push(`${bl} ${theme.dim("skip to defer · /abandon to cancel")}`);

  return lines;
}

/** Footer hint that depends on the question type. */
function answerHintFor(q: InterviewQuestion): string {
  if (q.type === "free_text") return "Type your answer.";
  if (q.type === "multi_select") {
    return q.allowCustomInput
      ? "Enter a number, comma-list (e.g. 1,3), 'all', or type a custom answer."
      : "Enter a number, comma-list (e.g. 1,3), or 'all'.";
  }
  // single_select
  return q.allowCustomInput
    ? "Enter a number, or type a custom answer."
    : "Enter a number.";
}
