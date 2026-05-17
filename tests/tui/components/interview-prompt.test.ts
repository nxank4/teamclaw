import { describe, expect, it } from "bun:test";

import { defaultTheme } from "../../../src/tui/themes/default.js";
import {
  INTERVIEW_MESSAGE_TAG,
  parseAnswer,
  renderQuestion,
  type QuestionPosition,
} from "../../../src/tui/components/interview-prompt/index.js";
import type { InterviewQuestion } from "../../../src/spec/interview.js";

const singleSelect: InterviewQuestion = {
  id: "auth-scope",
  question: "Which auth flow should we redesign first?",
  type: "single_select",
  options: [
    { label: "Login + signup", description: "Touched together most often" },
    { label: "Password reset" },
    { label: "OAuth providers" },
  ],
  allowCustomInput: true,
  rationale: "Scopes the work to one flow.",
};

const multiSelect: InterviewQuestion = {
  ...singleSelect,
  id: "auth-scope-multi",
  type: "multi_select",
};

const freeText: InterviewQuestion = {
  id: "constraints",
  question: "Any constraints I should respect?",
  type: "free_text",
  allowCustomInput: true,
};

const strict: InterviewQuestion = {
  ...singleSelect,
  id: "strict",
  allowCustomInput: false,
};

const pos: QuestionPosition = { current: 1, total: 5 };

// Strip ANSI escapes so assertions inspect plain text.
function plain(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
function plainLines(lines: string[]): string {
  return lines.map(plain).join("\n");
}

// ── Renderer ─────────────────────────────────────────────────────

describe("renderQuestion", () => {
  it("renders the branded header with current/total position", () => {
    const out = renderQuestion(singleSelect, pos, defaultTheme);
    expect(plainLines(out)).toContain(`${INTERVIEW_MESSAGE_TAG} · Question 1 of 5`);
  });

  it("flags the total with ~ when estimated:true", () => {
    const out = renderQuestion(
      singleSelect,
      { current: 2, total: 5, estimated: true },
      defaultTheme,
    );
    expect(plainLines(out)).toContain("Question 2 of ~5");
  });

  it("includes the question text and the rationale on its own dim line", () => {
    const out = renderQuestion(singleSelect, pos, defaultTheme);
    const text = plainLines(out);
    expect(text).toContain("Which auth flow should we redesign first?");
    expect(text).toContain("─ Scopes the work to one flow.");
  });

  it("renders numbered options with optional descriptions for single_select", () => {
    const out = renderQuestion(singleSelect, pos, defaultTheme);
    const text = plainLines(out);
    expect(text).toContain("1. Login + signup");
    expect(text).toContain("Touched together most often");
    expect(text).toContain("2. Password reset");
    expect(text).toContain("3. OAuth providers");
  });

  it("omits the options block for free_text questions", () => {
    const out = renderQuestion(freeText, pos, defaultTheme);
    const text = plainLines(out);
    expect(text).not.toMatch(/^\s*1\./m);
    expect(text).toContain("Type your answer.");
  });

  it("shows the right footer hint per question type", () => {
    expect(plainLines(renderQuestion(singleSelect, pos, defaultTheme)))
      .toContain("Enter a number, or type a custom answer.");
    expect(plainLines(renderQuestion(multiSelect, pos, defaultTheme)))
      .toContain("Enter a number, comma-list (e.g. 1,3), 'all', or type a custom answer.");
    expect(plainLines(renderQuestion(strict, pos, defaultTheme)))
      .toContain("Enter a number.");
  });

  it("always appends the 'skip / /abandon' escape-hatch line", () => {
    const out = renderQuestion(freeText, pos, defaultTheme);
    expect(plainLines(out)).toContain("skip to defer · /abandon to cancel");
  });
});

// ── Parser ───────────────────────────────────────────────────────

describe("parseAnswer", () => {
  it("treats empty / 'skip' / 'esc' as a skip sentinel for any type", () => {
    for (const q of [singleSelect, multiSelect, freeText, strict]) {
      for (const txt of ["", "  ", "skip", "Skip", "SKIP", "esc"]) {
        const r = parseAnswer(txt, q);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.answer.kind).toBe("skip");
      }
    }
  });

  it("parses a single number for single_select", () => {
    const r = parseAnswer("2", singleSelect);
    expect(r.ok).toBe(true);
    if (r.ok && r.answer.kind === "options") {
      expect(r.answer.selectedIndices).toEqual([1]);
    }
  });

  it("rejects a comma-list for single_select with a useful error", () => {
    const r = parseAnswer("1,3", singleSelect);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("single-select");
  });

  it("parses a comma-list for multi_select (with or without spaces)", () => {
    const r1 = parseAnswer("1,3", multiSelect);
    const r2 = parseAnswer("1, 3", multiSelect);
    for (const r of [r1, r2]) {
      expect(r.ok).toBe(true);
      if (r.ok && r.answer.kind === "options") {
        expect(r.answer.selectedIndices).toEqual([0, 2]);
      }
    }
  });

  it("'all' expands to every index for multi_select", () => {
    const r = parseAnswer("all", multiSelect);
    expect(r.ok).toBe(true);
    if (r.ok && r.answer.kind === "options") {
      expect(r.answer.selectedIndices).toEqual([0, 1, 2]);
    }
  });

  it("'all' is treated as custom text for single_select (when allowed)", () => {
    const r = parseAnswer("all", singleSelect);
    expect(r.ok).toBe(true);
    if (r.ok && r.answer.kind === "text") {
      expect(r.answer.text).toBe("all");
    }
  });

  it("dedupes repeated indices in a comma-list", () => {
    const r = parseAnswer("1,1,2", multiSelect);
    expect(r.ok).toBe(true);
    if (r.ok && r.answer.kind === "options") {
      expect(r.answer.selectedIndices).toEqual([0, 1]);
    }
  });

  it("rejects out-of-range numbers with a range-aware error", () => {
    const r = parseAnswer("9", singleSelect);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("9");
      expect(r.error).toContain("3");
    }
  });

  it("free_text passes the original casing through as text", () => {
    const r = parseAnswer("  No Migrations Please  ", freeText);
    expect(r.ok).toBe(true);
    if (r.ok && r.answer.kind === "text") {
      expect(r.answer.text).toBe("No Migrations Please");
    }
  });

  it("falls back to custom text for select questions when allowCustomInput", () => {
    const r = parseAnswer("just login for now", singleSelect);
    expect(r.ok).toBe(true);
    if (r.ok && r.answer.kind === "text") {
      expect(r.answer.text).toBe("just login for now");
    }
  });

  it("rejects custom text when allowCustomInput is false", () => {
    const r = parseAnswer("just login", strict);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/number/);
  });
});
