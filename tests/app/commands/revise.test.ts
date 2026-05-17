import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createReviseCommand } from "../../../src/app/commands/revise.js";
import type { InterviewServices, SpecPlanCommandDeps } from "../../../src/app/commands/spec.js";
import type {
  AnsweredQuestion,
  InterviewQuestion,
} from "../../../src/spec/interview.js";
import type { CodebaseContext } from "../../../src/spec/codebase-scan.js";
import { makeHarness } from "./spec-plan-shared.js";

function withTempDirs<T>(fn: (s: string, p: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "op-revise-"));
  return fn(join(root, "specs"), join(root, "plans")).finally(() =>
    rmSync(root, { recursive: true, force: true }),
  );
}

const QUESTIONS: InterviewQuestion[] = [
  {
    id: "scope",
    question: "Scope?",
    type: "free_text",
    allowCustomInput: true,
  },
];
const ANSWERS: AnsweredQuestion[] = [
  { question: QUESTIONS[0]!, answer: { questionId: "scope", kind: "text", text: "narrow" } },
];
const CTX: CodebaseContext = {
  fileTree: "",
  conventions: "",
  keyFiles: [],
  truncated: false,
};

function services(): InterviewServices {
  return {
    generateSpec: async () => "## Summary\nRevised spec.\n",
    generatePlan: async () => "## Tasks\n- [ ] redo\n",
  };
}

describe("createReviseCommand", () => {
  it("errors when no spec/plan is pending", async () => {
    await withTempDirs(async (s, p) => {
      const h = makeHarness(s, p);
      await createReviseCommand(h.makeDeps()).execute("", h.ctx);
      expect(h.messages.some((m) => m.role === "error" && m.content.includes("pending"))).toBe(true);
    });
  });

  it("no-arg form sets pendingReviseFeedback and emits the prompt", async () => {
    await withTempDirs(async (s, p) => {
      const h = makeHarness(s, p);
      // Seed a pending spec confirmation so /revise has something to revise.
      const specPath = join(s, "alpha.md");
      h.appCtx.pendingPhaseConfirmation = {
        kind: "spec",
        specPath,
        originalPrompt: "refactor auth",
        questions: QUESTIONS,
        answers: ANSWERS,
        codebaseContext: CTX,
        specBody: "## Summary\nOld body.\n",
      };

      const deps: SpecPlanCommandDeps = h.makeDeps({ interviewServices: services() });
      await createReviseCommand(deps).execute("", h.ctx);

      expect(h.appCtx.pendingReviseFeedback?.kind).toBe("spec");
      expect(h.messages.some((m) => m.content.includes("What should change"))).toBe(true);
    });
  });

  it("inline arg re-drafts the spec, overwriting the file", async () => {
    await withTempDirs(async (s, p) => {
      const h = makeHarness(s, p);
      const { mkdirSync } = await import("node:fs");
      mkdirSync(s, { recursive: true });
      const specPath = join(s, "alpha.md");
      writeFileSync(
        specPath,
        [
          "---",
          "slug: alpha",
          "status: draft",
          "created: 2026-01-01T00:00:00Z",
          "last_updated: 2026-01-01T00:00:00Z",
          "---",
          "",
          "## Summary",
          "Old body.",
        ].join("\n"),
      );
      h.appCtx.pendingPhaseConfirmation = {
        kind: "spec",
        specPath,
        originalPrompt: "refactor auth",
        questions: QUESTIONS,
        answers: ANSWERS,
        codebaseContext: CTX,
        specBody: "## Summary\nOld body.\n",
      };
      h.appCtx.lastOpenedSpec = { slug: "alpha", path: specPath };
      h.appCtx.lastOpenedKind = "spec";

      const deps: SpecPlanCommandDeps = h.makeDeps({ interviewServices: services() });
      await createReviseCommand(deps).execute("drop OAuth, focus on login", h.ctx);

      // File overwritten with the revised body.
      const body = readFileSync(specPath, "utf8");
      expect(body).toContain("Revised spec.");
      expect(body).not.toContain("Old body.");
      // Router abort was called (best-effort, even when nothing in flight).
      expect(h.routerAbortCalls).toEqual(["test-session"]);
      // The new answers array carries the appended feedback.
      const updated = h.appCtx.pendingPhaseConfirmation;
      expect(updated?.answers?.[updated.answers.length - 1]?.answer.kind).toBe("text");
    });
  });
});
