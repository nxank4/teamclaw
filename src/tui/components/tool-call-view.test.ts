/**
 * ToolCallView regression coverage for the unified-spinner work in
 * PR #120 — pending vs running state and multi-line input handling.
 */
import { describe, expect, it } from "bun:test";

import { ToolCallView } from "./tool-call-view.js";
import { ICONS } from "../constants/icons.js";
import { stripAnsi } from "../utils/text-width.js";

function makeView(overrides: {
  toolName?: string;
  inputSummary?: string;
  status?: "pending" | "running" | "completed" | "failed" | "aborted";
} = {}): ToolCallView {
  return new ToolCallView({
    executionId: "exec-1",
    toolName: overrides.toolName ?? "shell_exec",
    agentId: "coder",
    status: overrides.status ?? "running",
    inputSummary: overrides.inputSummary ?? "ls",
  });
}

describe("ToolCallView — pending vs running state", () => {
  it("pending state renders ⏳ + 'Awaiting approval:' verb, not the running spinner", () => {
    const v = makeView({ status: "pending", toolName: "shell_exec", inputSummary: "rm -rf foo" });
    const out = stripAnsi(v.render(80).join("\n"));
    expect(out).toContain(ICONS.hourglass);
    expect(out).toContain("Awaiting approval: shell exec");
    // None of the running-state verbs leak through.
    expect(out).not.toMatch(/\bRunning\b/);
    // None of the spinner frames appear in pending state.
    for (const f of ICONS.boxFrames) {
      expect(out).not.toContain(f);
    }
  });

  it("advanceSpinner is a no-op while pending so the hourglass stays still", () => {
    const v = makeView({ status: "pending" });
    const before = stripAnsi(v.render(80).join("\n"));
    for (let i = 0; i < 8; i++) v.advanceSpinner();
    const after = stripAnsi(v.render(80).join("\n"));
    expect(after).toBe(before);
  });

  it("setStatus('running') promotes a pending node, resets the spinner, and uses the running verb", () => {
    const v = makeView({ status: "pending", toolName: "shell_exec", inputSummary: "ls" });
    expect(v.status).toBe("pending");
    v.setStatus("running");
    expect(v.status).toBe("running");
    const out = stripAnsi(v.render(80).join("\n"));
    expect(out).toContain("Running");
    // Spinner resets to frame 0 on the flip — the first running render
    // shows boxFrames[0] with no prior advancement.
    expect(out).toContain(ICONS.boxFrames[0]!);
  });

  it("running state advances through the canonical box frames", () => {
    const v = makeView({ status: "running" });
    const seen = new Set<string>();
    for (let i = 0; i < ICONS.boxFrames.length; i++) {
      const out = stripAnsi(v.render(80).join("\n"));
      const match = out.match(new RegExp(`[${ICONS.boxFrames.join("")}]`));
      if (match) seen.add(match[0]);
      v.advanceSpinner();
    }
    // After one full cycle of advances, every frame must have been
    // rendered exactly once.
    for (const f of ICONS.boxFrames) expect(seen.has(f)).toBe(true);
  });
});

describe("ToolCallView — multi-line input handling", () => {
  it("renderOneLiner collapses embedded newlines to spaces", () => {
    const heredoc = "cat > hello.ts << 'EOF'\nexport function hello() {\n  return 'hi';\n}\nEOF";
    const v = makeView({ status: "completed", toolName: "shell_exec", inputSummary: heredoc });
    v.complete({ success: true, summary: "ok", duration: 50 });
    const baked = stripAnsi(v.renderOneLiner());
    expect(baked).not.toContain("\n");
    // The summary still surfaces the leading content of the command.
    expect(baked).toContain("cat > hello.ts");
  });

  it("live render emits the multi-line content within a single rendered entry", () => {
    const heredoc = "cat > hello.ts << 'EOF'\nexport function hello() {}";
    const v = makeView({ status: "running", inputSummary: heredoc });
    const rendered = v.render(80);
    // The renderer leaves multi-line content embedded so the
    // tree-aware caller (renderToolInTree in messages.ts) can split
    // and re-prefix every subline.
    expect(rendered.length).toBe(1);
    expect(rendered[0]!).toContain("\n");
  });
});
