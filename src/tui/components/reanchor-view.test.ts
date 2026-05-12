import { describe, expect, it } from "bun:test";

import { ReanchorView, renderReanchor } from "./reanchor-view.js";
import { buildReanchorPrompt } from "../../crew/drift-reanchor.js";

function strip(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function joined(lines: string[]): string {
  return lines.map(strip).join("\n");
}

const reanchor = buildReanchorPrompt({
  original_goal: "Add a /health endpoint to the API",
  drifting_decisions: [
    {
      description: "Refactor billing service",
      decided_in_phase_id: "p2",
      drift_distance: 0.85,
    },
  ],
  current_phase: { id: "p1", name: "Initial scaffolding" },
  drift_score: 0.82,
});

describe("renderReanchor — options mode", () => {
  it("renders the reanchor markdown verbatim", () => {
    const out = joined(
      renderReanchor({
        reanchor,
        current_goal: "Add a /health endpoint to the API",
      }),
    );
    expect(out).toContain("Drift halt");
    expect(out).toContain("Add a /health endpoint to the API");
    expect(out).toContain("Refactor billing service");
  });

  it("renders the three options in the footer", () => {
    const out = joined(
      renderReanchor({
        reanchor,
        current_goal: "Add a /health endpoint to the API",
      }),
    );
    expect(out).toContain("[c]");
    expect(out).toContain("[a]");
    expect(out).toContain("[e]");
    expect(out).toContain("continue");
    expect(out).toContain("abort");
    expect(out).toContain("edit goal");
  });

  it("titles the panel 'Re-anchor required'", () => {
    const out = joined(
      renderReanchor({
        reanchor,
        current_goal: "x",
      }),
    );
    expect(out).toContain("Re-anchor required");
  });
});

describe("renderReanchor — edit_goal mode", () => {
  it("shows editor section + Enter/Esc footer", () => {
    const out = joined(
      renderReanchor({
        reanchor,
        current_goal: "Add a /health endpoint",
        mode: "edit_goal",
      }),
    );
    expect(out).toContain("edit goal");
    expect(out).toContain("Enter");
    expect(out).toContain("Esc");
    // Pre-fills with the current goal.
    expect(out).toContain("Add a /health endpoint");
  });

  it("renders the editor_buffer when set, not the current goal", () => {
    const out = joined(
      renderReanchor({
        reanchor,
        current_goal: "old goal",
        mode: "edit_goal",
        editor_buffer: "Build a CLI instead",
      }),
    );
    expect(out).toContain("Build a CLI instead");
  });

  it("renders empty placeholder when buffer is empty", () => {
    const out = joined(
      renderReanchor({
        reanchor,
        current_goal: "anything",
        mode: "edit_goal",
        editor_buffer: "",
      }),
    );
    expect(out).toContain("empty");
  });
});

describe("ReanchorView", () => {
  it("setMode swaps option footer for editor view", () => {
    const view = new ReanchorView("rv", {
      reanchor,
      current_goal: "Add a /health endpoint",
    });
    expect(joined(view.render(80))).toContain("[c]");
    view.setMode("edit_goal");
    const after = joined(view.render(80));
    expect(after).toContain("Enter");
    expect(after).toContain("Esc");
    // Pre-filled with the current goal.
    expect(view.getEditorBuffer()).toContain("/health");
  });

  it("setEditorBuffer updates the buffer for next render", () => {
    const view = new ReanchorView("rv", {
      reanchor,
      current_goal: "old",
    });
    view.setMode("edit_goal");
    view.setEditorBuffer("new goal text");
    const out = joined(view.render(80));
    expect(out).toContain("new goal text");
    expect(view.getEditorBuffer()).toBe("new goal text");
  });

  it("returning to options mode hides the editor", () => {
    const view = new ReanchorView("rv", {
      reanchor,
      current_goal: "old",
    });
    view.setMode("edit_goal");
    view.setMode("options");
    const out = joined(view.render(80));
    expect(out).not.toContain("Enter");
    expect(out).toContain("[c]");
  });
});
