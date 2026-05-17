import { describe, expect, it } from "bun:test";

import { joinFrontmatter, splitFrontmatter } from "../../src/utils/frontmatter.js";

describe("splitFrontmatter", () => {
  it("returns null when the file has no leading frontmatter block", () => {
    expect(splitFrontmatter("# just a heading\n\nbody")).toBeNull();
  });

  it("parses a basic frontmatter + body pair", () => {
    const raw = "---\nname: foo\nvalue: 42\n---\n\n# Body";
    const result = splitFrontmatter(raw);
    expect(result).not.toBeNull();
    expect(result?.frontmatter).toEqual({ name: "foo", value: 42 });
    expect(result?.body).toBe("# Body");
  });

  it("tolerates a leading BOM and CRLF line endings", () => {
    const raw = "﻿---\r\nkey: bar\r\n---\r\n\r\nbody line";
    const result = splitFrontmatter(raw);
    expect(result?.frontmatter).toEqual({ key: "bar" });
    expect(result?.body).toBe("body line");
  });

  it("returns null when the closing delimiter is missing", () => {
    const raw = "---\nkey: bar\nno closing fence below\n# body";
    expect(splitFrontmatter(raw)).toBeNull();
  });
});

describe("joinFrontmatter", () => {
  it("round-trips through splitFrontmatter", () => {
    const fm = { slug: "user-auth", status: "draft" };
    const body = "## Section\n\ncontent\n";
    const rendered = joinFrontmatter(fm, body);
    const parsed = splitFrontmatter(rendered);
    expect(parsed?.frontmatter).toEqual(fm);
    expect(parsed?.body).toBe(body);
  });

  it("emits the standard --- ... --- delimiter pair", () => {
    const rendered = joinFrontmatter({ k: "v" }, "body");
    expect(rendered.startsWith("---\n")).toBe(true);
    expect(rendered).toContain("\n---\n");
  });
});
