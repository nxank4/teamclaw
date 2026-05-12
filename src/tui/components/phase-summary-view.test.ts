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
