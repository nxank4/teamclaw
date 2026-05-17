import { describe, expect, it } from "bun:test";

import {
  buildPlanUserPrompt,
  buildQuestionUserPrompt,
  buildSpecUserPrompt,
  clampQuestionCount,
  formatAnswers,
  formatCodebaseContext,
  generateInterviewQuestions,
  generatePlanFromAnswers,
  generateSpecFromAnswers,
  InterviewLLMError,
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  type AnsweredQuestion,
  type InterviewQuestion,
} from "../../src/spec/interview.js";
import type { CodebaseContext } from "../../src/spec/codebase-scan.js";

const emptyContext: CodebaseContext = {
  fileTree: "",
  conventions: "",
  keyFiles: [],
  truncated: false,
};

const richContext: CodebaseContext = {
  fileTree: "src/\n  auth/\n  billing/\npackage.json",
  conventions: "--- CLAUDE.md ---\nBe terse.",
  keyFiles: [
    { path: "src/auth/login.ts", excerpt: "export function login() {}" },
    { path: "src/auth/signup.ts", excerpt: "export function signup() {}" },
  ],
  truncated: false,
};

const validQuestion: InterviewQuestion = {
  id: "auth-scope",
  question: "Which auth flow should we redesign first?",
  type: "single_select",
  options: [
    { label: "Login + signup", description: "Touched together most often" },
    { label: "OAuth providers" },
  ],
  allowCustomInput: true,
  rationale: "Scopes the work to one flow at a time.",
};

const freeTextQuestion: InterviewQuestion = {
  id: "constraints",
  question: "Any constraints I should respect?",
  type: "free_text",
  allowCustomInput: true,
  rationale: "Surfaces blockers.",
};

// ── clampQuestionCount ─────────────────────────────────────────────

describe("clampQuestionCount", () => {
  it("returns the list as-is when in [MIN, MAX]", () => {
    const five = Array.from({ length: 5 }, (_, i) => ({
      ...validQuestion,
      id: `q-${i}`,
    }));
    expect(clampQuestionCount(five)).toHaveLength(5);
  });

  it("slices the head when over MAX_QUESTIONS", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      ...validQuestion,
      id: `q-${i}`,
    }));
    const out = clampQuestionCount(many);
    expect(out).toHaveLength(MAX_QUESTIONS);
    // First-N kept, not last-N
    expect(out[0]?.id).toBe("q-0");
    expect(out[MAX_QUESTIONS - 1]?.id).toBe(`q-${MAX_QUESTIONS - 1}`);
  });

  it("pads with filler free-text questions when under MIN_QUESTIONS", () => {
    const out = clampQuestionCount([validQuestion]);
    expect(out.length).toBeGreaterThanOrEqual(MIN_QUESTIONS);
    expect(out[0]?.id).toBe("auth-scope"); // original kept first
    // Fillers are free-text
    for (let i = 1; i < out.length; i++) {
      expect(out[i]?.type).toBe("free_text");
    }
  });

  it("does not duplicate filler ids the LLM already produced", () => {
    const filler: InterviewQuestion = {
      id: "filler-constraints",
      question: "What constraints?",
      type: "free_text",
      allowCustomInput: true,
    };
    const out = clampQuestionCount([filler]);
    expect(out.length).toBeGreaterThanOrEqual(MIN_QUESTIONS);
    const ids = out.map((q) => q.id);
    const occurrences = ids.filter((id) => id === "filler-constraints").length;
    expect(occurrences).toBe(1);
  });
});

// ── formatCodebaseContext ──────────────────────────────────────────

describe("formatCodebaseContext", () => {
  it("returns empty string for an empty context", () => {
    expect(formatCodebaseContext(emptyContext)).toBe("");
  });

  it("emits headers only for non-empty sections", () => {
    const conventionsOnly: CodebaseContext = {
      ...emptyContext,
      conventions: "--- CLAUDE.md ---\nBe terse.",
    };
    const out = formatCodebaseContext(conventionsOnly);
    expect(out).toContain("Project conventions");
    expect(out).not.toContain("Project structure");
    expect(out).not.toContain("Relevant files");
  });

  it("renders all sections + a truncation marker when present", () => {
    const truncated: CodebaseContext = { ...richContext, truncated: true };
    const out = formatCodebaseContext(truncated);
    expect(out).toContain("Project structure");
    expect(out).toContain("src/auth/login.ts");
    expect(out).toContain("Project conventions");
    expect(out).toContain("truncated by budget");
  });
});

// ── formatAnswers ──────────────────────────────────────────────────

describe("formatAnswers", () => {
  it("handles an empty list", () => {
    expect(formatAnswers([])).toBe("(no answers recorded)");
  });

  it("renders each answer kind correctly", () => {
    const items: AnsweredQuestion[] = [
      {
        question: validQuestion,
        answer: { questionId: "auth-scope", kind: "options", selectedIndices: [0] },
      },
      {
        question: freeTextQuestion,
        answer: { questionId: "constraints", kind: "text", text: "no breaking changes" },
      },
      {
        question: { ...validQuestion, id: "other" },
        answer: { questionId: "other", kind: "skip" },
      },
    ];
    const out = formatAnswers(items);
    expect(out).toContain("Login + signup"); // option label rendered
    expect(out).toContain("no breaking changes");
    expect(out).toContain("skipped");
    expect(out).toContain("Assumptions"); // skip hint mentions Assumptions section
  });
});

// ── buildQuestionUserPrompt ────────────────────────────────────────

describe("buildQuestionUserPrompt", () => {
  it("embeds the user prompt + codebase context + JSON instruction", () => {
    const p = buildQuestionUserPrompt("refactor auth", richContext);
    expect(p).toContain("refactor auth");
    expect(p).toContain("src/auth/login.ts");
    expect(p).toContain("Return JSON only");
  });

  it("omits the codebase section when context is empty", () => {
    const p = buildQuestionUserPrompt("any prompt", emptyContext);
    expect(p).toContain("any prompt");
    expect(p).not.toContain("## Codebase context");
  });
});

describe("buildSpecUserPrompt", () => {
  it("includes user prompt, answers, and context", () => {
    const items: AnsweredQuestion[] = [
      {
        question: freeTextQuestion,
        answer: { questionId: "constraints", kind: "text", text: "must ship by Friday" },
      },
    ];
    const p = buildSpecUserPrompt("refactor auth", items, richContext);
    expect(p).toContain("refactor auth");
    expect(p).toContain("must ship by Friday");
    expect(p).toContain("src/auth/login.ts");
    expect(p).toContain("Markdown only");
  });
});

describe("buildPlanUserPrompt", () => {
  it("includes spec body alongside the user prompt + answers + context", () => {
    const items: AnsweredQuestion[] = [
      {
        question: freeTextQuestion,
        answer: { questionId: "constraints", kind: "text", text: "low risk" },
      },
    ];
    const p = buildPlanUserPrompt("refactor auth", items, "## Summary\nFlatten login.", richContext);
    expect(p).toContain("refactor auth");
    expect(p).toContain("## Approved spec");
    expect(p).toContain("Flatten login.");
    expect(p).toContain("low risk");
    expect(p).toContain("src/auth/login.ts");
  });
});

// ── generateInterviewQuestions ─────────────────────────────────────

function makeQuestionResponse(questions: unknown[]): string {
  return JSON.stringify({ questions });
}

describe("generateInterviewQuestions", () => {
  it("returns parsed questions when the LLM emits a valid response", async () => {
    const qs = [validQuestion, { ...validQuestion, id: "second" }, freeTextQuestion];
    const out = await generateInterviewQuestions("refactor auth", emptyContext, {
      llmCall: async () => makeQuestionResponse(qs),
    });
    expect(out).toHaveLength(3);
    expect(out[0]?.id).toBe("auth-scope");
    expect(out[2]?.type).toBe("free_text");
  });

  it("clamps a 2-question LLM response up to MIN_QUESTIONS by padding fillers", async () => {
    const qs = [
      { ...validQuestion, id: "q1" },
      { ...validQuestion, id: "q2" },
    ];
    const out = await generateInterviewQuestions("refactor auth", emptyContext, {
      llmCall: async () => makeQuestionResponse(qs),
    });
    expect(out.length).toBeGreaterThanOrEqual(MIN_QUESTIONS);
    expect(out[0]?.id).toBe("q1");
    expect(out[1]?.id).toBe("q2");
    expect(out[2]?.type).toBe("free_text"); // filler
  });

  it("clamps a 20-question LLM response down to MAX_QUESTIONS", async () => {
    const qs = Array.from({ length: 20 }, (_, i) => ({
      ...validQuestion,
      id: `q-${i}`,
    }));
    const out = await generateInterviewQuestions("refactor auth", emptyContext, {
      llmCall: async () => makeQuestionResponse(qs),
    });
    expect(out).toHaveLength(MAX_QUESTIONS);
  });

  it("throws InterviewLLMError on unparseable JSON", async () => {
    await expect(
      generateInterviewQuestions("refactor auth", emptyContext, {
        llmCall: async () => "definitely not json {{{",
      }),
    ).rejects.toBeInstanceOf(InterviewLLMError);
  });

  it("throws InterviewLLMError when schema is violated (missing question field)", async () => {
    const malformed = [{ id: "x", type: "single_select", options: [{ label: "a" }] }];
    await expect(
      generateInterviewQuestions("refactor auth", emptyContext, {
        llmCall: async () => makeQuestionResponse(malformed),
      }),
    ).rejects.toBeInstanceOf(InterviewLLMError);
  });

  it("throws InterviewLLMError when a select question has no options", async () => {
    const noOptions = [
      { ...validQuestion, options: undefined },
      { ...validQuestion, id: "q2" },
      { ...validQuestion, id: "q3" },
    ];
    await expect(
      generateInterviewQuestions("refactor auth", emptyContext, {
        llmCall: async () => makeQuestionResponse(noOptions),
      }),
    ).rejects.toBeInstanceOf(InterviewLLMError);
  });

  it("accepts a free_text question without options", async () => {
    const qs = [
      freeTextQuestion,
      { ...freeTextQuestion, id: "q2" },
      { ...freeTextQuestion, id: "q3" },
    ];
    const out = await generateInterviewQuestions("any", emptyContext, {
      llmCall: async () => makeQuestionResponse(qs),
    });
    expect(out).toHaveLength(3);
  });

  it("recovers JSON wrapped in markdown fences (via safeJsonParse layer)", async () => {
    const qs = [validQuestion, { ...validQuestion, id: "q2" }, { ...validQuestion, id: "q3" }];
    const wrapped = "```json\n" + JSON.stringify({ questions: qs }) + "\n```";
    const out = await generateInterviewQuestions("refactor", emptyContext, {
      llmCall: async () => wrapped,
    });
    expect(out).toHaveLength(3);
  });
});

// ── generateSpecFromAnswers / generatePlanFromAnswers ──────────────

describe("generateSpecFromAnswers", () => {
  it("returns the LLM's text trimmed", async () => {
    const items: AnsweredQuestion[] = [
      {
        question: freeTextQuestion,
        answer: { questionId: "constraints", kind: "text", text: "low risk" },
      },
    ];
    const body = "## Summary\nDo the thing.\n";
    const out = await generateSpecFromAnswers("refactor auth", items, emptyContext, {
      llmCall: async () => `  \n${body}\n  `,
    });
    expect(out).toBe(body.trim());
  });

  it("forwards the assembled prompt to the LLM call so the model sees answers + context", async () => {
    const items: AnsweredQuestion[] = [
      {
        question: validQuestion,
        answer: { questionId: "auth-scope", kind: "options", selectedIndices: [1] },
      },
    ];
    let receivedUser = "";
    let receivedSystem = "";
    await generateSpecFromAnswers("refactor auth", items, richContext, {
      llmCall: async (userPrompt, systemPrompt) => {
        receivedUser = userPrompt;
        receivedSystem = systemPrompt;
        return "## Summary\nx";
      },
    });
    // User prompt carries the answer label + codebase context
    expect(receivedUser).toContain("OAuth providers");
    expect(receivedUser).toContain("src/auth/login.ts");
    // System prompt instructs the model on the spec skeleton
    expect(receivedSystem).toContain("## Summary");
    expect(receivedSystem).toContain("## Assumptions");
  });
});

describe("generatePlanFromAnswers", () => {
  it("returns the LLM's text trimmed and includes spec body in the prompt", async () => {
    const items: AnsweredQuestion[] = [
      {
        question: freeTextQuestion,
        answer: { questionId: "constraints", kind: "text", text: "no migrations" },
      },
    ];
    let receivedUser = "";
    const body = "## Tasks\n- [ ] do x";
    const out = await generatePlanFromAnswers(
      "refactor auth",
      items,
      "## Summary\nFlatten login.",
      emptyContext,
      {
        llmCall: async (userPrompt) => {
          receivedUser = userPrompt;
          return `  ${body}  `;
        },
      },
    );
    expect(out).toBe(body.trim());
    expect(receivedUser).toContain("Flatten login.");
    expect(receivedUser).toContain("no migrations");
  });
});
