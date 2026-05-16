import { describe, expect, it } from "bun:test";

import {
  PhaseSummaryView,
  renderPhaseSummary,
} from "./phase-summary-view.js";
import type { PhaseSummaryArtifactPayload } from "../../crew/artifacts/types.js";
import { CrewPhaseSchema } from "../../crew/types.js";

// ANSI strip — assertions read against raw text.
function strip(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function joined(lines: string[]): string {
  return lines.map(strip).join("\n");
}

function fixturePhase(): ReturnType<typeof CrewPhaseSchema.parse> {
  return CrewPhaseSchema.parse({
    id: "p1",
    name: "Add health endpoint",
    description: "Wire route + handler",
    complexity_tier: "2",
    tasks: [
      {
        id: "t1",
        phase_id: "p1",
        description: "Create src/routes/health.ts handler",
        assigned_agent: "coder",
        depends_on: [],
        status: "completed",
        input_tokens: 1500,
        output_tokens: 500,
        wall_time_ms: 4500,
      },
      {
        id: "t2",
        phase_id: "p1",
        description: "Register handler in src/server.ts",
        assigned_agent: "coder",
        depends_on: ["t1"],
        status: "failed",
        input_tokens: 800,
        output_tokens: 200,
        wall_time_ms: 1200,
        error: "tsc check failed",
      },
    ],
  });
}

const payload: PhaseSummaryArtifactPayload = {
  phase_id: "p1",
  tasks_completed: 1,
  tasks_failed: 1,
  tasks_blocked: 0,
  files_created: ["src/routes/health.ts"],
  files_modified: ["src/server.ts"],
  key_decisions: [],
  agent_confidences: { coder: 80, reviewer: 65 },
  blocked_reasons: [],
};

describe("renderPhaseSummary", () => {
  it("renders phase name, tier badge, task table, files, and action footer", () => {
    const lines = renderPhaseSummary({
      phase: fixturePhase(),
      payload,
    });
    const out = joined(lines);
    expect(out).toContain("Add health endpoint");
    expect(out).toContain("T2 moderate");
    expect(out).toContain("t1");
    expect(out).toContain("Create src/routes/health.ts");
    expect(out).toContain("coder");
    expect(out).toContain("files created");
    expect(out).toContain("src/routes/health.ts");
    expect(out).toContain("files modified");
    expect(out).toContain("src/server.ts");
    expect(out).toContain("[c]");
    expect(out).toContain("[a]");
    expect(out).toContain("[x]");
  });

  it("uses the accent ✦ bullet (not •) for file-list entries", () => {
    const lines = renderPhaseSummary({
      phase: fixturePhase(),
      payload,
    });
    const out = joined(lines);
    expect(out).toContain("✦ src/routes/health.ts");
    expect(out).toContain("✦ src/server.ts");
    // The old • bullet must not appear in the file-list region.
    const fileRegion = out.slice(out.indexOf("files created"));
    expect(fileRegion).not.toContain("•");
  });

  it("renders agent confidence bars when provided", () => {
    const lines = renderPhaseSummary({
      phase: fixturePhase(),
      payload,
    });
    const out = joined(lines);
    expect(out).toContain("agent confidences");
    expect(out).toContain("coder");
    expect(out).toContain("80%");
    expect(out).toContain("reviewer");
    expect(out).toContain("65%");
  });

  it("omits confidence section when agent_confidences is empty", () => {
    const lines = renderPhaseSummary({
      phase: fixturePhase(),
      payload: { ...payload, agent_confidences: {} },
    });
    const out = joined(lines);
    expect(out).not.toContain("agent confidences");
  });

  it("renders drift score when provided", () => {
    const lines = renderPhaseSummary({
      phase: fixturePhase(),
      payload,
      drift_score: 0.42,
    });
    const out = joined(lines);
    expect(out).toContain("drift score");
    expect(out).toContain("42%");
  });

  it("renders meeting markdown section when provided", () => {
    const lines = renderPhaseSummary({
      phase: fixturePhase(),
      payload,
      meeting_markdown: "# Phase 1 retro\n\n- shipped /health\n- next: tests",
    });
    const out = joined(lines);
    expect(out).toContain("meeting notes");
    expect(out).toContain("Phase 1 retro");
    expect(out).toContain("shipped /health");
  });

  it("includes auto-advance countdown when not strict", () => {
    const lines = renderPhaseSummary({
      phase: fixturePhase(),
      payload,
      auto_advance_remaining_ms: 8500,
    });
    const out = joined(lines);
    expect(out).toContain("advancing in");
    expect(out).toMatch(/advancing in \d+s/);
  });

  it("hides countdown in strict mode", () => {
    const lines = renderPhaseSummary({
      phase: fixturePhase(),
      payload,
      strict_mode: true,
      auto_advance_remaining_ms: 5000,
    });
    const out = joined(lines);
    expect(out).not.toContain("advancing in");
    expect(out).toContain("/continue");
    expect(out).toContain("/adjust");
    expect(out).toContain("/abort");
  });

  it("handles empty task list gracefully", () => {
    const phase = CrewPhaseSchema.parse({
      id: "p1",
      name: "Empty phase",
      description: "no tasks",
      complexity_tier: "1",
      tasks: [],
    });
    const out = joined(
      renderPhaseSummary({
        phase,
        payload: {
          phase_id: "p1",
          tasks_completed: 0,
          tasks_failed: 0,
          tasks_blocked: 0,
          files_created: [],
          files_modified: [],
          key_decisions: [],
          agent_confidences: {},
          blocked_reasons: [],
        },
      }),
    );
    expect(out).toContain("Empty phase");
    expect(out).toContain("no tasks");
  });
});

describe("PhaseSummaryView", () => {
  it("setProps merges and re-renders", () => {
    const view = new PhaseSummaryView("p1-summary", {
      phase: fixturePhase(),
      payload,
    });
    const before = joined(view.render(80));
    expect(before).not.toContain("advancing in");
    view.setProps({ auto_advance_remaining_ms: 10_000 });
    const after = joined(view.render(80));
    expect(after).toContain("advancing in");
  });

  it("getProps returns current props", () => {
    const view = new PhaseSummaryView("v", {
      phase: fixturePhase(),
      payload,
    });
    expect(view.getProps().payload.phase_id).toBe("p1");
  });
});

describe("renderPhaseSummary — blocked_reason sub-line", () => {
  function blockedPhase(reasonMessage: string): ReturnType<typeof CrewPhaseSchema.parse> {
    return CrewPhaseSchema.parse({
      id: "p1",
      name: "Blocked phase",
      description: "Demo",
      complexity_tier: "2",
      tasks: [
        {
          id: "t1",
          phase_id: "p1",
          description: "Run a thing",
          assigned_agent: "coder",
          depends_on: [],
          status: "blocked",
          blocked_reason: {
            code: "budget_session_exceeded",
            message: reasonMessage,
            details: { scope: "session" },
          },
        },
      ],
    });
  }

  it("renders blocked_reason under a blocked task with ↳ glyph", () => {
    const lines = renderPhaseSummary({
      phase: blockedPhase("Session token cap reached (10000 / 5000)."),
      payload: { ...payload, tasks_blocked: 1 },
    });
    const out = joined(lines);
    // Task row + ↳ row both present, with the reason message visible.
    expect(out).toContain("t1");
    expect(out).toContain("↳");
    expect(out).toContain("Session token cap reached");
  });

  it("wraps long blocked_reason messages with hanging indent", () => {
    // Message long enough to force wrapping at a typical 80-col width.
    const long =
      "Session token cap reached (123456 / 50000). Increase max_tokens_per_session in the manifest, or split the goal into shorter runs so the planner stays within budget.";
    const lines = renderPhaseSummary({
      phase: blockedPhase(long),
      payload: { ...payload, tasks_blocked: 1 },
    });
    const stripped = lines.map((s) => s.replace(/\x1b\[[0-9;]*m/g, ""));
    // Find every line that contains a fragment of the reason text — the
    // first one has the ↳ glyph; the continuation line(s) should share
    // the same leading indent (no ↳) so they line up under the message.
    const reasonLines = stripped.filter((l) => /Session|max_tokens|split/.test(l));
    expect(reasonLines.length).toBeGreaterThan(1); // wrapped at least once
    // Indent of every continuation matches the first reason line's
    // indent (allowing the ↳ glyph itself to take its single col).
    const firstIndent = reasonLines[0]!.match(/^ +/)?.[0].length ?? 0;
    expect(firstIndent).toBeGreaterThan(0);
    for (const l of reasonLines.slice(1)) {
      const ind = l.match(/^ +/)?.[0].length ?? 0;
      expect(ind).toBe(firstIndent);
    }
  });

  it("omits the ↳ line for completed / failed tasks", () => {
    // The default fixturePhase has one completed + one failed task and
    // no blocked task; no ↳ row should appear.
    const lines = renderPhaseSummary({
      phase: fixturePhase(),
      payload,
    });
    const out = joined(lines);
    expect(out).not.toContain("↳");
  });

  it("handles a blocked task with no blocked_reason (defensive)", () => {
    // A task in the blocked state but without the structured reason
    // (e.g. produced by older code paths) must not crash the renderer
    // and must not emit a stray ↳ line.
    const phase = CrewPhaseSchema.parse({
      id: "p1",
      name: "Empty reason",
      description: "Demo",
      complexity_tier: "2",
      tasks: [
        {
          id: "t1",
          phase_id: "p1",
          description: "Task",
          assigned_agent: "coder",
          depends_on: [],
          status: "blocked",
          // intentionally no blocked_reason
        },
      ],
    });
    const lines = renderPhaseSummary({
      phase,
      payload: { ...payload, tasks_blocked: 1 },
    });
    const out = joined(lines);
    expect(out).toContain("t1");
    expect(out).not.toContain("↳");
  });
});
