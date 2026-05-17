/**
 * Parser for user replies to an interview question.
 *
 * Reads the raw input string + the question metadata and produces
 * either an {@link InterviewAnswer} or a structured error the
 * prompt-handler can surface as a chat message. Pure — no I/O, no
 * dependency on the TUI. The renderer's footer hints describe the
 * accepted syntax; this parser is the source of truth for what
 * those hints mean.
 *
 * Recognised input shapes (all matched after `.trim().toLowerCase()`):
 *
 *   "skip" / "esc" / ""                  → kind: skip
 *   "all"  (multi_select only)           → all option indices
 *   "1"                                  → single index
 *   "1, 3" / "1,3"                       → multiple indices
 *   anything else, if allowCustomInput   → kind: text (original text)
 *   anything else, if !allowCustomInput  → ParseError
 */

import type {
  InterviewAnswer,
  InterviewQuestion,
} from "../../../spec/interview.js";

export type ParseResult =
  | { ok: true; answer: InterviewAnswer }
  | { ok: false; error: string };

/** Pure RFC: regex of `^\d+(\s*,\s*\d+)*$` — pure-number lists. */
const NUMBER_LIST_RE = /^\d+(?:\s*,\s*\d+)*$/;

export function parseAnswer(
  rawText: string,
  q: InterviewQuestion,
): ParseResult {
  const trimmed = rawText.trim();
  const normalized = trimmed.toLowerCase();

  // Skip sentinel — works for every question type, including free_text.
  if (normalized === "" || normalized === "skip" || normalized === "esc") {
    return { ok: true, answer: { questionId: q.id, kind: "skip" } };
  }

  if (q.type === "free_text") {
    // free_text is always text — original casing preserved.
    return { ok: true, answer: { questionId: q.id, kind: "text", text: trimmed } };
  }

  // Select questions: try number / number-list / "all" first, fall back
  // to custom text iff allowCustomInput.
  const options = q.options ?? [];

  if (q.type === "multi_select" && normalized === "all") {
    if (options.length === 0) {
      return { ok: false, error: "This question has no options to select." };
    }
    return {
      ok: true,
      answer: {
        questionId: q.id,
        kind: "options",
        selectedIndices: options.map((_, i) => i),
      },
    };
  }

  if (NUMBER_LIST_RE.test(normalized)) {
    const ones = normalized
      .split(",")
      .map((s) => Number.parseInt(s.trim(), 10));
    // Validate range — 1-based input, 0-based indices.
    const outOfRange = ones.find((n) => n < 1 || n > options.length);
    if (outOfRange !== undefined) {
      return {
        ok: false,
        error: `Number ${outOfRange} is out of range; pick between 1 and ${options.length}.`,
      };
    }
    if (q.type === "single_select" && ones.length > 1) {
      return {
        ok: false,
        error: "This is a single-select question; enter exactly one number.",
      };
    }
    const indices = dedupe(ones.map((n) => n - 1));
    return {
      ok: true,
      answer: { questionId: q.id, kind: "options", selectedIndices: indices },
    };
  }

  // Not numeric — treat as custom text if the question allows it.
  if (q.allowCustomInput) {
    return { ok: true, answer: { questionId: q.id, kind: "text", text: trimmed } };
  }

  return {
    ok: false,
    error: `Expected a number (1..${options.length})${q.type === "multi_select" ? ", a comma-list, or 'all'" : ""}.`,
  };
}

/** Preserve first-seen order, drop duplicates. */
function dedupe(xs: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const x of xs) {
    if (!seen.has(x)) { seen.add(x); out.push(x); }
  }
  return out;
}
