import { describe, it, expect } from "vitest";
import { ToolCallView } from "../../src/tui/components/tool-call-view.js";

describe("ToolCallView", () => {
  it("renders running state with spinner icon and tool name", () => {
    const view = new ToolCallView({ executionId: "e1", toolName: "file_read", toolDisplayName: "Read File", agentId: "coder", status: "running", inputSummary: "src/auth.ts" });
    const lines = view.render(80);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0]).toContain("Reading");
    expect(lines[0]).toContain("src/auth.ts");
  });

  it("renders completed state with tick and duration", () => {
    const view = new ToolCallView({ executionId: "e1", toolName: "file_read", toolDisplayName: "Read File", agentId: "coder", status: "running", inputSummary: "src/auth.ts" });
    view.complete({ success: true, summary: "Read src/auth.ts (148 lines)", fullOutput: "line1\nline2", duration: 120 });
    const lines = view.render(80);
    expect(lines[0]).toContain("Read");
    expect(lines[0]).toContain("120ms");
  });

  it("renders failed state with cross and error", () => {
    const view = new ToolCallView({ executionId: "e1", toolName: "file_read", toolDisplayName: "Read File", agentId: "coder", status: "running", inputSummary: "missing.ts" });
    view.complete({ success: false, summary: "File not found", duration: 5 });
    const lines = view.render(80);
    // Should contain error indicator
    expect(lines.some((l) => l.includes("not found") || l.includes("✗"))).toBe(true);
  });

  it("renders aborted state", () => {
    const view = new ToolCallView({ executionId: "e1", toolName: "file_read", toolDisplayName: "Read File", agentId: "coder", status: "running", inputSummary: "src/big.ts" });
    view.abort();
    const lines = view.render(80);
    expect(lines[0]).toContain("◼");
  });

  it("collapsed hides full output", () => {
    const view = new ToolCallView({ executionId: "e1", toolName: "file_read", toolDisplayName: "Read File", agentId: "coder", status: "running", inputSummary: "src/auth.ts" });
    view.complete({ success: true, summary: "ok", fullOutput: "line1\nline2\nline3", duration: 10 });
    const lines = view.render(80);
    // Should NOT contain the output lines (collapsed by default)
    expect(lines.some((l) => l.includes("line1"))).toBe(false);
  });

  it("expanded shows output with │ prefix", () => {
    const view = new ToolCallView({ executionId: "e1", toolName: "file_read", toolDisplayName: "Read File", agentId: "coder", status: "running", inputSummary: "src/auth.ts" });
    view.complete({ success: true, summary: "ok", fullOutput: "line1\nline2\nline3", duration: 10 });
    view.toggleExpand();
    const lines = view.render(80);
    expect(view.isExpanded).toBe(true);
    expect(lines.some((l) => l.includes("│") && l.includes("line1"))).toBe(true);
  });

  it("toggleExpand switches between states", () => {
    const view = new ToolCallView({ executionId: "e1", toolName: "file_read", toolDisplayName: "Read File", agentId: "coder", status: "running", inputSummary: "test" });
    view.complete({ success: true, summary: "ok", fullOutput: "data", duration: 5 });
    expect(view.isExpanded).toBe(false);
    view.toggleExpand();
    expect(view.isExpanded).toBe(true);
    view.toggleExpand();
    expect(view.isExpanded).toBe(false);
  });

  it("truncates long output to maxLines", () => {
    const longOutput = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    const view = new ToolCallView({ executionId: "e1", toolName: "file_read", toolDisplayName: "Read File", agentId: "coder", status: "running", inputSummary: "big.ts" });
    view.complete({ success: true, summary: "ok", fullOutput: longOutput, duration: 10 });
    view.toggleExpand();
    const lines = view.render(80);
    // Should have header line + truncated output (< 50 lines)
    expect(lines.length).toBeLessThan(50);
    expect(lines.some((l) => l.includes("more lines"))).toBe(true);
  });

  it("duration formatted correctly", () => {
    const view = new ToolCallView({ executionId: "e1", toolName: "shell_exec", toolDisplayName: "Run Shell", agentId: "coder", status: "running", inputSummary: "npm test" });
    view.complete({ success: true, summary: "ok", duration: 2500 });
    const lines = view.render(80);
    expect(lines[0]).toContain("2.5s");
  });

  it("tool name maps to correct verb", () => {
    const cases = [
      { toolName: "file_read", expected: "Read" },
      { toolName: "file_write", expected: "Wrote" },
      { toolName: "shell_exec", expected: "Ran" },
    ];
    for (const { toolName, expected } of cases) {
      const view = new ToolCallView({ executionId: "e1", toolName, toolDisplayName: toolName, agentId: "coder", status: "running", inputSummary: "test" });
      view.complete({ success: true, summary: "ok", duration: 5 });
      const lines = view.render(80);
      expect(lines[0]).toContain(expected);
    }
  });
});
