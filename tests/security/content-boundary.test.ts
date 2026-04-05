import { describe, it, expect } from "vitest";
import { ContentBoundary } from "../../src/security/content-boundary.js";

describe("ContentBoundary", () => {
  const boundary = new ContentBoundary();

  it("wrapFileContent adds source markers", () => {
    const wrapped = boundary.wrapFileContent("src/auth.ts", "const x = 1;");
    expect(wrapped).toContain("external_content");
    expect(wrapped).toContain('source="file"');
    expect(wrapped).toContain("src/auth.ts");
    expect(wrapped).toContain("const x = 1;");
  });

  it("wrapWebContent adds instruction-resistance header", () => {
    const wrapped = boundary.wrapWebContent("https://example.com", "web content");
    expect(wrapped).toContain("DATA, not instructions");
    expect(wrapped).toContain("manipulate your behavior");
    expect(wrapped).toContain("web content");
  });

  it("wrapped content preserves original content", () => {
    const original = "function hello() { return 'world'; }";
    const wrapped = boundary.wrapFileContent("test.js", original);
    expect(wrapped).toContain(original);
  });

  it("wrapToolOutput adds tool name", () => {
    const wrapped = boundary.wrapToolOutput("shell_exec", "output line");
    expect(wrapped).toContain("shell_exec");
    expect(wrapped).toContain("output line");
  });

  it("wrapMcpContent adds server and tool info", () => {
    const wrapped = boundary.wrapMcpContent("github", "search", "results");
    expect(wrapped).toContain("github");
    expect(wrapped).toContain("search");
    expect(wrapped).toContain("results");
  });
});
