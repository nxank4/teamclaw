import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  listPlans,
  loadPlanFromFile,
  parseTasks,
  PlanLoadError,
} from "../../src/plans/loader.js";

function withTempPlan<T>(content: string, fn: (path: string) => T | Promise<T>): T | Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "op-plan-loader-"));
  const path = join(dir, "test.md");
  writeFileSync(path, content);
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  try {
    const result = fn(path);
    if (result instanceof Promise) return result.finally(cleanup);
    cleanup();
    return result;
  } catch (err) {
    cleanup();
    throw err;
  }
}

const VALID = [
  "---",
  "slug: user-auth",
  "status: draft",
  "spec: ./specs/user-auth.md",
  "created: 2026-01-15T10:00:00Z",
  "last_updated: 2026-01-15T10:00:00Z",
  "---",
  "",
  "# user-auth",
  "",
  "## Tasks",
  "",
  "- [ ] Add OAuth provider config",
  "  - files: src/auth/oauth.ts, src/auth/index.ts",
  "  - risks: token leak via logs",
  "  - test: integration test for full flow",
  "- [x] Migrate existing sessions",
  "  - files: src/auth/migrate.ts",
  "  - test: idempotent run, smoke + perf",
  "",
  "## Verification",
  "",
  "Manual run-through.",
].join("\n");

describe("loadPlanFromFile", () => {
  it("parses a well-formed plan with linked spec and tasks", async () => {
    await withTempPlan(VALID, async (path) => {
      const doc = await loadPlanFromFile(path);
      expect(doc.frontmatter.slug).toBe("user-auth");
      expect(doc.frontmatter.spec).toBe("./specs/user-auth.md");
      expect(doc.tasks).toHaveLength(2);
      expect(doc.tasks[0]?.description).toBe("Add OAuth provider config");
      expect(doc.tasks[0]?.done).toBe(false);
      expect(doc.tasks[0]?.filesTouched).toEqual([
        "src/auth/oauth.ts",
        "src/auth/index.ts",
      ]);
      expect(doc.tasks[0]?.risks).toEqual(["token leak via logs"]);
      expect(doc.tasks[0]?.testPlan).toEqual(["integration test for full flow"]);
      expect(doc.tasks[1]?.done).toBe(true);
      expect(doc.tasks[1]?.testPlan).toEqual(["idempotent run", "smoke + perf"]);
    });
  });

  it("rejects a plan without frontmatter", async () => {
    await withTempPlan("# bare", async (path) => {
      let caught: unknown;
      try { await loadPlanFromFile(path); } catch (err) { caught = err; }
      expect(caught).toBeInstanceOf(PlanLoadError);
    });
  });

  it("rejects an unknown status", async () => {
    await withTempPlan(VALID.replace("status: draft", "status: ongoing"), async (path) => {
      let caught: unknown;
      try { await loadPlanFromFile(path); } catch (err) { caught = err; }
      expect(caught).toBeInstanceOf(PlanLoadError);
    });
  });

  it("treats missing optional spec field as valid", async () => {
    const noSpec = VALID.replace("spec: ./specs/user-auth.md\n", "");
    await withTempPlan(noSpec, async (path) => {
      const doc = await loadPlanFromFile(path);
      expect(doc.frontmatter.spec).toBeUndefined();
    });
  });

  it("returns an empty tasks array when the body has no ## Tasks section", async () => {
    const noTasks = VALID.replace(
      /## Tasks[\s\S]*?## Verification/,
      "## Verification",
    );
    await withTempPlan(noTasks, async (path) => {
      const doc = await loadPlanFromFile(path);
      expect(doc.tasks).toEqual([]);
    });
  });
});

describe("parseTasks", () => {
  it("parses a checked task without sub-bullets", () => {
    const body = "## Tasks\n\n- [x] just done\n";
    const tasks = parseTasks(body);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.done).toBe(true);
    expect(tasks[0]?.description).toBe("just done");
    expect(tasks[0]?.filesTouched).toEqual([]);
  });

  it("ignores nested bullets that aren't the recognised prefixes", () => {
    const body = [
      "## Tasks",
      "- [ ] task",
      "  - notes: free-form ramble that doesn't categorise",
      "  - files: a.ts",
    ].join("\n");
    const tasks = parseTasks(body);
    expect(tasks[0]?.filesTouched).toEqual(["a.ts"]);
    expect(tasks[0]?.risks).toEqual([]);
  });

  it("stops accumulating sub-bullets when the next task header appears", () => {
    const body = [
      "## Tasks",
      "- [ ] first",
      "  - files: a.ts",
      "- [ ] second",
      "  - files: b.ts",
    ].join("\n");
    const tasks = parseTasks(body);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.filesTouched).toEqual(["a.ts"]);
    expect(tasks[1]?.filesTouched).toEqual(["b.ts"]);
  });
});

describe("listPlans", () => {
  it("returns an empty array when the directory does not exist", async () => {
    const plans = await listPlans("/nonexistent-op-plans-dir");
    expect(plans).toEqual([]);
  });

  it("loads every .md file from the directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "op-plan-list-"));
    try {
      writeFileSync(join(dir, "alpha.md"), VALID);
      writeFileSync(join(dir, "beta.md"), VALID.replace("user-auth", "billing"));
      const plans = await listPlans(dir);
      expect(plans).toHaveLength(2);
      expect(plans.map((p) => p.frontmatter.slug).sort()).toEqual(["billing", "user-auth"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
