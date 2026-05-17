import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadPlanFromFile } from "../../src/plans/loader.js";
import { writePlan } from "../../src/plans/writer.js";
import type { PlanDocument } from "../../src/plans/types.js";

function makeDoc(path: string): PlanDocument {
  return {
    frontmatter: {
      slug: "alpha",
      status: "draft",
      created: "2026-01-01T00:00:00.000Z",
      last_updated: "2026-01-01T00:00:00.000Z",
      spec: "./specs/alpha.md",
    },
    body: "## Tasks\n\n- [ ] task one\n  - files: a.ts\n",
    tasks: [],
    sourcePath: path,
  };
}

describe("writePlan", () => {
  it("round-trips through loadPlanFromFile", async () => {
    const dir = mkdtempSync(join(tmpdir(), "op-plan-writer-"));
    try {
      const path = join(dir, "alpha.md");
      const doc = makeDoc(path);
      const written = await writePlan(doc, new Date("2026-03-04T05:06:07.000Z"));
      expect(written.frontmatter.last_updated).toBe("2026-03-04T05:06:07.000Z");

      const reloaded = await loadPlanFromFile(path);
      expect(reloaded.frontmatter.slug).toBe("alpha");
      expect(reloaded.frontmatter.spec).toBe("./specs/alpha.md");
      expect(reloaded.tasks).toHaveLength(1);
      expect(reloaded.tasks[0]?.filesTouched).toEqual(["a.ts"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
