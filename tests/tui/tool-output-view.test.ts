import { describe, it, expect } from "vitest";
import { ToolOutputView } from "../../src/tui/components/tool-output-view.js";

describe("ToolOutputView", () => {
  it("detects diff output type from @@ markers", () => {
    const type = ToolOutputView.detectType("file_edit", "@@ -1,3 +1,5 @@\n-old\n+new");
    expect(type).toBe("diff");
  });

  it("detects shell output type from shell_exec tool", () => {
    const type = ToolOutputView.detectType("shell_exec", "PASS tests/auth.test.ts");
    expect(type).toBe("shell");
  });

  it("detects JSON output type from valid JSON", () => {
    const type = ToolOutputView.detectType("web_fetch", '{"status": "ok"}');
    expect(type).toBe("json");
  });

  it("falls back to text for unknown content", () => {
    const type = ToolOutputView.detectType("file_read", "just some text content");
    expect(type).toBe("text");
  });

  it("returns none for empty output", () => {
    const type = ToolOutputView.detectType("file_read", "");
    expect(type).toBe("none");
  });

  it("renders nothing when collapsed", () => {
    const lines = ToolOutputView.render("some output", "text", { terminalWidth: 80, expanded: false });
    expect(lines).toHaveLength(0);
  });

  it("renders output with │ prefix when expanded", () => {
    const lines = ToolOutputView.render("line1\nline2", "text", { terminalWidth: 80, expanded: true });
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      expect(line).toContain("│");
    }
  });

  it("respects maxLines truncation", () => {
    const longOutput = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    const lines = ToolOutputView.render(longOutput, "text", { terminalWidth: 80, maxLines: 25, expanded: true });
    expect(lines.length).toBeLessThanOrEqual(30); // 25 + separator lines
    expect(lines.some((l) => l.includes("more lines"))).toBe(true);
  });
});
