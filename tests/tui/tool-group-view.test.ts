import { describe, it, expect } from "vitest";
import { ToolGroupView } from "../../src/tui/components/tool-group-view.js";
import { ToolCallView } from "../../src/tui/components/tool-call-view.js";

function makeCall(id: string, toolName: string, status: "running" | "completed" = "completed"): ToolCallView {
  const view = new ToolCallView({ executionId: id, toolName, toolDisplayName: toolName, agentId: "coder", status: status === "completed" ? "running" : status, inputSummary: "test" });
  if (status === "completed") {
    view.complete({ success: true, summary: "ok", duration: 10 });
  }
  return view;
}

describe("ToolGroupView", () => {
  it("groups consecutive tool calls", () => {
    const group = new ToolGroupView("coder");
    group.addCall(makeCall("e1", "file_read"));
    group.addCall(makeCall("e2", "file_write"));
    const lines = group.render(80);
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it("shows group header for 3+ tools", () => {
    const group = new ToolGroupView("coder");
    group.addCall(makeCall("e1", "file_read"));
    group.addCall(makeCall("e2", "file_read"));
    group.addCall(makeCall("e3", "file_write"));
    const lines = group.render(80);
    expect(lines.some((l) => l.includes("3 tools"))).toBe(true);
  });

  it("each tool independently expandable", () => {
    const group = new ToolGroupView("coder");
    const call1 = makeCall("e1", "file_read");
    const call2 = makeCall("e2", "file_write");
    group.addCall(call1);
    group.addCall(call2);

    call1.toggleExpand();
    expect(call1.isExpanded).toBe(true);
    expect(call2.isExpanded).toBe(false);
  });

  it("isComplete when all calls done", () => {
    const group = new ToolGroupView("coder");
    group.addCall(makeCall("e1", "file_read", "completed"));
    group.addCall(makeCall("e2", "file_write", "running"));
    expect(group.isComplete).toBe(false);

    // Complete the running one
    group.getCall("e2")!.complete({ success: true, summary: "ok", duration: 5 });
    expect(group.isComplete).toBe(true);
  });

  it("renders in correct order", () => {
    const group = new ToolGroupView("coder");
    group.addCall(makeCall("first", "file_read"));
    group.addCall(makeCall("second", "file_write"));
    const lines = group.render(80);
    const readIdx = lines.findIndex((l) => l.includes("Read"));
    const writeIdx = lines.findIndex((l) => l.includes("Wrote"));
    expect(readIdx).toBeLessThan(writeIdx);
  });
});
