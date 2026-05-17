import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadSpecFromFile } from "../../src/spec/loader.js";
import { writeSpec } from "../../src/spec/writer.js";
import type { SpecDocument } from "../../src/spec/types.js";

function makeDoc(path: string): SpecDocument {
  return {
    frontmatter: {
      slug: "feature-x",
      status: "draft",
      created: "2026-01-01T00:00:00.000Z",
      last_updated: "2026-01-01T00:00:00.000Z",
    },
    body: "## Body\n\ncontent here\n",
    sourcePath: path,
  };
}

describe("writeSpec", () => {
  it("writes a spec that round-trips through loadSpecFromFile", async () => {
    const dir = mkdtempSync(join(tmpdir(), "op-spec-writer-"));
    try {
      const path = join(dir, "feature-x.md");
      const doc = makeDoc(path);
      const written = await writeSpec(doc, new Date("2026-02-02T03:04:05.000Z"));
      expect(written.frontmatter.last_updated).toBe("2026-02-02T03:04:05.000Z");

      const reloaded = await loadSpecFromFile(path);
      expect(reloaded.frontmatter.slug).toBe("feature-x");
      expect(reloaded.frontmatter.last_updated).toBe("2026-02-02T03:04:05.000Z");
      expect(reloaded.body).toBe("## Body\n\ncontent here\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects an invalid status before touching the disk", async () => {
    const dir = mkdtempSync(join(tmpdir(), "op-spec-writer-"));
    try {
      const path = join(dir, "x.md");
      const doc = makeDoc(path);
      // @ts-expect-error — deliberately invalid status for the validation test
      doc.frontmatter.status = "wibble";
      let threw = false;
      try {
        await writeSpec(doc);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
