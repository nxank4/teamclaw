import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { listSpecs, loadSpecFromFile, SpecLoadError } from "../../src/spec/loader.js";

function withTempSpec<T>(content: string, fn: (path: string) => T | Promise<T>): T | Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "op-spec-loader-"));
  const path = join(dir, "test.md");
  writeFileSync(path, content);
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  try {
    const result = fn(path);
    if (result instanceof Promise) {
      return result.finally(cleanup);
    }
    cleanup();
    return result;
  } catch (err) {
    cleanup();
    throw err;
  }
}

const VALID_FRONTMATTER = [
  "---",
  "slug: user-auth",
  "status: draft",
  "created: 2026-01-15T10:00:00Z",
  "last_updated: 2026-01-15T10:00:00Z",
  "---",
  "",
  "# user-auth",
  "",
  "spec body content",
].join("\n");

describe("loadSpecFromFile", () => {
  it("parses a well-formed spec file", async () => {
    await withTempSpec(VALID_FRONTMATTER, async (path) => {
      const doc = await loadSpecFromFile(path);
      expect(doc.frontmatter.slug).toBe("user-auth");
      expect(doc.frontmatter.status).toBe("draft");
      expect(doc.body).toContain("spec body content");
      expect(doc.sourcePath).toBe(path);
    });
  });

  it("rejects a file without frontmatter", async () => {
    await withTempSpec("# bare markdown\n\nno fence", async (path) => {
      let caught: unknown;
      try {
        await loadSpecFromFile(path);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(SpecLoadError);
      expect((caught as SpecLoadError).message).toContain("missing YAML frontmatter");
    });
  });

  it("rejects frontmatter with an invalid slug", async () => {
    const bad = VALID_FRONTMATTER.replace("slug: user-auth", "slug: Bad_Slug!");
    await withTempSpec(bad, async (path) => {
      let caught: unknown;
      try {
        await loadSpecFromFile(path);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(SpecLoadError);
      expect((caught as SpecLoadError).message).toContain("slug");
    });
  });

  it("rejects frontmatter with an unknown status enum", async () => {
    const bad = VALID_FRONTMATTER.replace("status: draft", "status: wibble");
    await withTempSpec(bad, async (path) => {
      let caught: unknown;
      try {
        await loadSpecFromFile(path);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(SpecLoadError);
    });
  });

  it("rejects frontmatter with a missing required field", async () => {
    const bad = VALID_FRONTMATTER.replace("created: 2026-01-15T10:00:00Z\n", "");
    await withTempSpec(bad, async (path) => {
      let caught: unknown;
      try {
        await loadSpecFromFile(path);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(SpecLoadError);
    });
  });
});

describe("listSpecs", () => {
  it("returns an empty array when the directory does not exist", async () => {
    const specs = await listSpecs("/nonexistent-op-specs-dir");
    expect(specs).toEqual([]);
  });

  it("loads every .md file from the directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "op-spec-list-"));
    try {
      writeFileSync(join(dir, "alpha.md"), VALID_FRONTMATTER);
      writeFileSync(join(dir, "beta.md"), VALID_FRONTMATTER.replace("user-auth", "billing"));
      writeFileSync(join(dir, "ignore-me.txt"), "not markdown");
      const specs = await listSpecs(dir);
      expect(specs).toHaveLength(2);
      const slugs = specs.map((s) => s.frontmatter.slug).sort();
      expect(slugs).toEqual(["billing", "user-auth"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
