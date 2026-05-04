import { describe, expect, it } from "bun:test";

import { parsePlan } from "./plan-parser.js";

const HAPPY_PLAN = JSON.stringify([
  {
    id: "p1",
    name: "Scaffold",
    description: "Set up the basics",
    tasks: [
      {
        id: "t1",
        phase_id: "p1",
        description: "Create src/health.ts",
        assigned_agent: "coder",
        depends_on: [],
      },
      {
        id: "t2",
        phase_id: "p1",
        description: "Add fastify route handler",
        assigned_agent: "coder",
        depends_on: ["t1"],
      },
      {
        id: "t3",
        phase_id: "p1",
        description: "Read existing app shape",
        assigned_agent: "reviewer",
        depends_on: [],
      },
    ],
  },
  {
    id: "p2",
    name: "Test",
    description: "Verify the endpoint",
    tasks: [
      {
        id: "t4",
        phase_id: "p2",
        description: "Write integration test for /health",
        assigned_agent: "tester",
        depends_on: ["t2"],
      },
      {
        id: "t5",
        phase_id: "p2",
        description: "Run the test suite",
        assigned_agent: "tester",
        depends_on: ["t4"],
      },
      {
        id: "t6",
        phase_id: "p2",
        description: "Review the diff",
        assigned_agent: "reviewer",
        depends_on: ["t4"],
      },
    ],
  },
]);

describe("parsePlan — happy path", () => {
  it("accepts a 2-phase, 6-task valid plan", () => {
    const r = parsePlan(HAPPY_PLAN);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.phases).toHaveLength(2);
      expect(r.phases[0]?.tasks).toHaveLength(3);
      expect(r.phases[1]?.tasks[0]?.depends_on).toEqual(["t2"]); // cross-phase
      // complexity_tier defaults to "2" when not provided
      expect(r.phases[0]?.complexity_tier).toBe("2");
    }
  });

  it("recovers from JSON wrapped in code fences via safeJsonParse", () => {
    const fenced = "```json\n" + HAPPY_PLAN + "\n```";
    const r = parsePlan(fenced);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.phases).toHaveLength(2);
  });

  it("accepts {phases: [...]} envelope shape", () => {
    const enveloped = JSON.stringify({ phases: JSON.parse(HAPPY_PLAN) });
    const r = parsePlan(enveloped);
    expect(r.ok).toBe(true);
  });
});

describe("parsePlan — semantic rejections", () => {
  it("rejects orphan_dependency", () => {
    const plan = JSON.stringify([
      {
        id: "p1",
        name: "Phase 1",
        description: "x",
        tasks: [
          {
            id: "t1",
            phase_id: "p1",
            description: "Build the thing",
            assigned_agent: "coder",
            depends_on: ["nonexistent"],
          },
        ],
      },
    ]);
    const r = parsePlan(plan);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.reason).toBe("orphan_dependency");
      expect(r.error.message).toContain("nonexistent");
    }
  });

  it("rejects dependency_cycle (a → b → a)", () => {
    const plan = JSON.stringify([
      {
        id: "p1",
        name: "Phase 1",
        description: "x",
        tasks: [
          {
            id: "a",
            phase_id: "p1",
            description: "Build a",
            assigned_agent: "coder",
            depends_on: ["b"],
          },
          {
            id: "b",
            phase_id: "p1",
            description: "Build b",
            assigned_agent: "coder",
            depends_on: ["a"],
          },
        ],
      },
    ]);
    const r = parsePlan(plan);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.reason).toBe("dependency_cycle");
      expect(r.error.message).toContain("→");
    }
  });

  it("rejects empty_phase", () => {
    const plan = JSON.stringify([
      { id: "p1", name: "Empty", description: "x", tasks: [] },
    ]);
    const r = parsePlan(plan);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.reason).toBe("empty_phase");
  });
});

describe("parsePlan — planner self-assignment", () => {
  it("downgrades planner self-assignment to coder for write-intent tasks", () => {
    const plan = JSON.stringify([
      {
        id: "p1",
        name: "Phase 1",
        description: "x",
        tasks: [
          {
            id: "t1",
            phase_id: "p1",
            description: "Write the migration script",
            assigned_agent: "planner",
            depends_on: [],
          },
        ],
      },
    ]);
    const r = parsePlan(plan);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.phases[0]?.tasks[0]?.assigned_agent).toBe("coder");
    }
  });

  it("rejects planner self-assignment for non-write task", () => {
    const plan = JSON.stringify([
      {
        id: "p1",
        name: "Phase 1",
        description: "x",
        tasks: [
          {
            id: "t1",
            phase_id: "p1",
            description: "Examine the current architecture",
            assigned_agent: "planner",
            depends_on: [],
          },
        ],
      },
    ]);
    const r = parsePlan(plan);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.reason).toBe("planner_self_assignment");
  });
});

describe("parsePlan — structural failures", () => {
  it("returns json_parse_failed on garbage input", () => {
    const r = parsePlan("not json at all");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.reason).toBe("json_parse_failed");
  });

  it("returns schema_invalid on shape mismatch", () => {
    const r = parsePlan(JSON.stringify({ wrong: "shape" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.reason).toBe("schema_invalid");
  });

  it("returns schema_invalid when a task is missing required fields", () => {
    const plan = JSON.stringify([
      {
        id: "p1",
        name: "Phase 1",
        description: "x",
        tasks: [{ id: "t1" /* no phase_id, no description, no agent */ }],
      },
    ]);
    const r = parsePlan(plan);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.reason).toBe("schema_invalid");
  });
});
