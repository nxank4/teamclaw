import { describe, expect, it } from "bun:test";

import { CrewProgressView, renderCrewProgress } from "./crew-progress-view.js";
import {
  addTokens,
  createCrewRunState,
  markAgentBlocked,
  markAgentDone,
  markAgentQueued,
  markAgentRunning,
} from "../../app/crew-run-state.js";

function strip(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function joined(lines: string[]): string {
  return lines.map(strip).join("\n");
}

describe("renderCrewProgress", () => {
  it("renders an empty list when no agents have been seen", () => {
    const state = createCrewRunState("goal");
    expect(renderCrewProgress({ state, spinnerFrame: 0 })).toEqual([]);
  });

  it("renders ✓ glyph and metric for done agents", () => {
    const state = createCrewRunState("");
    markAgentDone(state, "planner", "7 tasks");
    const out = joined(renderCrewProgress({ state, spinnerFrame: 0 }));
    expect(out).toContain("✓");
    expect(out).toContain("Planner");
    expect(out).toContain("7 tasks");
  });

  it("renders ○ glyph for queued agents", () => {
    const state = createCrewRunState("");
    markAgentQueued(state, "reviewer", "2 tasks");
    const out = joined(renderCrewProgress({ state, spinnerFrame: 0 }));
    expect(out).toContain("○");
    expect(out).toContain("Reviewer");
  });

  it("renders ⊘ glyph for blocked agents with reason as metric", () => {
    const state = createCrewRunState("");
    markAgentBlocked(state, "coder", "missing tool: shell_exec");
    const out = joined(renderCrewProgress({ state, spinnerFrame: 0 }));
    expect(out).toContain("⊘");
    expect(out).toContain("missing tool: shell_exec");
  });

  it("last agent in the list uses └─ instead of ├─", () => {
    const state = createCrewRunState("");
    markAgentDone(state, "planner", "3 tasks");
    markAgentRunning(state, "coder");
    markAgentQueued(state, "tester", "queued");
    const out = renderCrewProgress({ state, spinnerFrame: 0 }).map(strip);
    expect(out[0]).toMatch(/^├─/);
    expect(out[1]).toMatch(/^├─/);
    expect(out[2]).toMatch(/^└─/);
  });

  it("token footer is folded inline onto the last agent line", () => {
    const state = createCrewRunState("");
    markAgentDone(state, "planner", "3 tasks");
    addTokens(state, "planner", 5000, 7400);
    const lines = renderCrewProgress({ state, spinnerFrame: 0 }).map(strip);
    // Single agent → exactly one line, no extra footer row.
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line).toMatch(/^└─/);
    expect(line).toContain("Planner");
    expect(line).toContain("3 tasks");
    // Token cells appear after the metric on the same line.
    expect(line).toMatch(/↑ 5\.0k\s+↓ 7\.4k$/);
    // No more literal "tokens" prefix from the old separate row.
    expect(line).not.toContain("tokens");
  });

  it("inline footer renders `↑ 0  ↓ 0` when no tokens have been counted yet", () => {
    const state = createCrewRunState("");
    markAgentRunning(state, "coder");
    const lines = renderCrewProgress({ state, spinnerFrame: 0 }).map(strip);
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line).toMatch(/^└─/);
    expect(line).toMatch(/↑ 0\s+↓ 0$/);
  });

  it("inline footer attaches to the last entry across multiple agents (done)", () => {
    const state = createCrewRunState("");
    markAgentDone(state, "planner", "3 tasks");
    markAgentDone(state, "reviewer", "ok");
    addTokens(state, "reviewer", 1200, 85);
    const lines = renderCrewProgress({ state, spinnerFrame: 0 }).map(strip);
    // Two agents → two lines, no third footer row.
    expect(lines).toHaveLength(2);
    expect(lines[0]!).toMatch(/^├─/);
    expect(lines[0]!).not.toContain("↑");
    expect(lines[1]!).toMatch(/^└─/);
    expect(lines[1]!).toContain("Reviewer");
    expect(lines[1]!).toMatch(/↑ 1\.2k\s+↓ 85$/);
  });

  it("inline footer attaches to the last entry when it is still running", () => {
    const state = createCrewRunState("");
    markAgentDone(state, "planner", "3 tasks");
    markAgentRunning(state, "coder");
    addTokens(state, "coder", 800, 200);
    const lines = renderCrewProgress({ state, spinnerFrame: 0 }).map(strip);
    expect(lines).toHaveLength(2);
    const last = lines[1]!;
    expect(last).toMatch(/^└─/);
    // Spinner frame 0 → ▖
    expect(last).toContain("▖");
    expect(last).toContain("Coder");
    expect(last).toMatch(/↑ 800\s+↓ 200$/);
  });

  it("running agent picks a frame from boxFrames keyed by spinnerFrame", () => {
    const state = createCrewRunState("");
    markAgentRunning(state, "coder");
    const frame0 = strip(renderCrewProgress({ state, spinnerFrame: 0 })[0]!);
    const frame2 = strip(renderCrewProgress({ state, spinnerFrame: 2 })[0]!);
    expect(frame0).toContain("▖");
    expect(frame2).toContain("▝");
  });
});

describe("CrewProgressView", () => {
  it("is hidden by default until host toggles it", () => {
    const view = new CrewProgressView("crew-progress", {
      state: createCrewRunState(""),
      spinnerFrame: 0,
    });
    expect(view.hidden).toBe(true);
    expect(view.id).toBe("crew-progress");
  });

  it("setProps merges partial updates without losing other props", () => {
    const state1 = createCrewRunState("");
    markAgentRunning(state1, "coder");
    const view = new CrewProgressView("crew-progress", { state: state1, spinnerFrame: 0 });
    view.setProps({ spinnerFrame: 3 });
    expect(view.getProps().state).toBe(state1);
    expect(view.getProps().spinnerFrame).toBe(3);

    const state2 = createCrewRunState("");
    markAgentDone(state2, "planner", "1 task");
    view.setProps({ state: state2 });
    expect(view.getProps().state).toBe(state2);
    expect(view.getProps().spinnerFrame).toBe(3);
  });

  it("render(width) returns the renderer's output", () => {
    const state = createCrewRunState("");
    markAgentDone(state, "planner", "1 task");
    const view = new CrewProgressView("crew-progress", { state, spinnerFrame: 0 });
    const out = joined(view.render(80));
    expect(out).toContain("Planner");
    expect(out).toContain("1 task");
  });
});
