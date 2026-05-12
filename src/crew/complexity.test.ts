import { describe, expect, it } from "bun:test";

import {
  classifyPhaseComplexity,
  describePhaseComplexity,
} from "./complexity.js";
import { CrewPhaseSchema, CrewTaskSchema } from "./types.js";

function task(
  id: string,
  description: string,
  opts: { agent?: string; depends_on?: string[]; phase_id?: string } = {},
) {
  return CrewTaskSchema.parse({
    id,
    phase_id: opts.phase_id ?? "p1",
    description,
    assigned_agent: opts.agent ?? "coder",
    depends_on: opts.depends_on ?? [],
  });
}

function phase(
  id: string,
  tasks: ReturnType<typeof task>[],
) {
  return CrewPhaseSchema.parse({
    id,
    name: id,
    description: "",
    tasks,
  });
}

describe("classifyPhaseComplexity — Tier 1", () => {
  it("two simple tasks, no deps, no file paths → Tier 1", () => {
    const p = phase("p1", [
      task("t1", "Plan the API surface"),
      task("t2", "Sketch a UX flow"),
    ]);
    expect(classifyPhaseComplexity(p)).toBe("1");
  });

  it("single task, no files → Tier 1", () => {
    const p = phase("p1", [task("t1", "Set the project tagline")]);
    expect(classifyPhaseComplexity(p)).toBe("1");
  });

  it("two tasks, two distinct files mentioned, no deps → Tier 1", () => {
    const p = phase("p1", [
      task("t1", "Edit src/foo.ts"),
      task("t2", "Edit src/bar.ts"),
    ]);
    expect(classifyPhaseComplexity(p)).toBe("1");
  });

  it("empty phase defaults to Tier 1", () => {
    const p = phase("p1", []);
    expect(classifyPhaseComplexity(p)).toBe("1");
  });
});

describe("classifyPhaseComplexity — Tier 2", () => {
  it("two tasks with an in-phase dep are Tier 2 (not Tier 1)", () => {
    const p = phase("p1", [
      task("t1", "Write src/foo.ts"),
      task("t2", "Test src/foo.ts", { depends_on: ["t1"] }),
    ]);
    expect(classifyPhaseComplexity(p)).toBe("2");
  });

  it("three tasks with linear deps and ≤ 10 files → Tier 2", () => {
    const p = phase("p1", [
      task("t1", "Edit src/a.ts"),
      task("t2", "Edit src/b.ts", { depends_on: ["t1"] }),
      task("t3", "Edit src/c.ts", { depends_on: ["t2"] }),
    ]);
    expect(classifyPhaseComplexity(p)).toBe("2");
  });

  it("single task that mentions five files → Tier 2", () => {
    const p = phase("p1", [
      task(
        "t1",
        "Refactor src/a.ts, src/b.ts, src/c.ts, src/d.ts, src/e.ts",
      ),
    ]);
    expect(classifyPhaseComplexity(p)).toBe("2");
  });
});

describe("classifyPhaseComplexity — Tier 3", () => {
  it("five tasks → Tier 3 by task count alone", () => {
    const tasks = [
      task("t1", "Plan"),
      task("t2", "Plan"),
      task("t3", "Plan"),
      task("t4", "Plan"),
      task("t5", "Plan"),
    ];
    const p = phase("p1", tasks);
    expect(classifyPhaseComplexity(p)).toBe("3");
  });

  it("max dependency depth > 2 → Tier 3", () => {
    const p = phase("p1", [
      task("t1", "a"),
      task("t2", "b", { depends_on: ["t1"] }),
      task("t3", "c", { depends_on: ["t2"] }),
      task("t4", "d", { depends_on: ["t3"] }),
    ]);
    expect(classifyPhaseComplexity(p)).toBe("3");
  });

  it("cross-phase task reference → Tier 3", () => {
    const p = phase("p2", [
      task("t1", "Test the thing", {
        depends_on: ["task-from-other-phase"],
        phase_id: "p2",
      }),
    ]);
    expect(classifyPhaseComplexity(p)).toBe("3");
  });
});

describe("describePhaseComplexity — heuristic inputs", () => {
  it("reports the full input snapshot", () => {
    const p = phase("p1", [
      task("t1", "Edit src/a.ts"),
      task("t2", "Edit src/b.ts", { depends_on: ["t1"] }),
      task("t3", "Edit src/c.ts", { depends_on: ["t2"] }),
    ]);
    const h = describePhaseComplexity(p);
    expect(h.task_count).toBe(3);
    expect(h.unique_files).toBe(3);
    expect(h.max_depth).toBe(2);
    expect(h.in_phase_deps).toBe(true);
    expect(h.cross_phase).toBe(false);
    expect(h.tier).toBe("2");
  });
});
