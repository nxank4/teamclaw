import { describe, expect, it } from "bun:test";

import { renderPlanMarkdown } from "./prompt-router.js";
import { CrewPhaseSchema } from "../crew/types.js";

function makePhase(overrides: {
  id: string;
  name: string;
  tasks: Array<{
    id: string;
    description: string;
    assigned_agent: string;
    depends_on?: string[];
  }>;
}): ReturnType<typeof CrewPhaseSchema.parse> {
  return CrewPhaseSchema.parse({
    id: overrides.id,
    name: overrides.name,
    description: "",
    complexity_tier: "2",
    tasks: overrides.tasks.map((t) => ({
      id: t.id,
      phase_id: overrides.id,
      description: t.description,
      assigned_agent: t.assigned_agent,
      depends_on: t.depends_on ?? [],
    })),
  });
}

describe("renderPlanMarkdown", () => {
  it("renders phase count and task count header", () => {
    const md = renderPlanMarkdown([
      makePhase({
        id: "p1",
        name: "Setup",
        tasks: [
          { id: "t1", description: "Scan tests", assigned_agent: "tester" },
          { id: "t2", description: "Verify deps", assigned_agent: "tester" },
        ],
      }),
      makePhase({
        id: "p2",
        name: "Run",
        tasks: [
          { id: "t3", description: "Execute suite", assigned_agent: "tester" },
        ],
      }),
    ]);
    expect(md.split("\n")[0]).toBe("**Plan: 2 phases, 3 tasks**");
  });

  it("renders [depends: ...] only when non-empty", () => {
    const md = renderPlanMarkdown([
      makePhase({
        id: "p1",
        name: "Setup",
        tasks: [
          { id: "t1", description: "first", assigned_agent: "coder" },
          { id: "t2", description: "second", assigned_agent: "coder", depends_on: ["t1"] },
        ],
      }),
    ]);
    expect(md).toContain("  t1 · Coder · first");
    expect(md).toContain("  t2 · Coder · second [depends: t1]");
    // t1 has no deps line.
    const t1Line = md.split("\n").find((l) => l.includes("t1 ·"))!;
    expect(t1Line).not.toContain("depends");
  });

  it("uses agentDisplayName for assigned_agent (raw id Coder -> Coder)", () => {
    const md = renderPlanMarkdown([
      makePhase({
        id: "p1",
        name: "Review",
        tasks: [
          { id: "t1", description: "Read code", assigned_agent: "reviewer" },
        ],
      }),
    ]);
    expect(md).toContain("Reviewer");
    expect(md).not.toContain(" reviewer "); // raw id should not leak
  });

  it("handles a single-phase, single-task plan without misnumbering", () => {
    const md = renderPlanMarkdown([
      makePhase({
        id: "p1",
        name: "Build",
        tasks: [
          { id: "t1", description: "Write hello.ts", assigned_agent: "coder" },
        ],
      }),
    ]);
    const lines = md.split("\n");
    expect(lines[0]).toBe("**Plan: 1 phase, 1 task**");
    expect(lines).toContain("**Phase 1 — Build**");
  });
});
