import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { CrewTaskSchema } from "./types.js";
import { validateTaskCompletion } from "./validator.js";

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(path.join(os.tmpdir(), "openpawl-validator-"));
});
afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

function task(overrides: {
  description?: string;
  files_created?: string[];
  files_modified?: string[];
}) {
  return CrewTaskSchema.parse({
    id: "t1",
    phase_id: "p1",
    description: overrides.description ?? "Do the thing",
    assigned_agent: "coder",
    files_created: overrides.files_created ?? [],
    files_modified: overrides.files_modified ?? [],
  });
}

function writeFile(rel: string, content: string): void {
  const abs = path.join(workdir, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf-8");
}

describe("validateTaskCompletion — happy paths", () => {
  it("passes when claimed created file exists with content", () => {
    writeFile("src/foo.ts", "export const x = 1;");
    const r = validateTaskCompletion(
      task({ description: "Create src/foo.ts", files_created: ["src/foo.ts"] }),
      workdir,
    );
    expect(r.ok).toBe(true);
  });

  it("passes when claimed modified file exists (even if empty)", () => {
    writeFile("src/foo.ts", "");
    const r = validateTaskCompletion(
      task({ description: "Edit src/foo.ts", files_modified: ["src/foo.ts"] }),
      workdir,
    );
    expect(r.ok).toBe(true);
  });

  it("passes for read-only/inspection task with no write claims and no write-intent", () => {
    const r = validateTaskCompletion(
      task({ description: "Inspect the repo layout" }),
      workdir,
    );
    expect(r.ok).toBe(true);
  });

  it("absolute paths in claims are honored", () => {
    writeFile("a.ts", "// content");
    const abs = path.join(workdir, "a.ts");
    const r = validateTaskCompletion(
      task({ description: "Make a.ts", files_created: [abs] }),
      workdir,
    );
    expect(r.ok).toBe(true);
  });
});

describe("validateTaskCompletion — failures", () => {
  it("fails when a claimed created file is missing", () => {
    const r = validateTaskCompletion(
      task({ description: "Create src/missing.ts", files_created: ["src/missing.ts"] }),
      workdir,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("does not exist");
  });

  it("fails when a claimed created file is empty (zero bytes)", () => {
    writeFile("src/empty.ts", "");
    const r = validateTaskCompletion(
      task({ description: "Create src/empty.ts", files_created: ["src/empty.ts"] }),
      workdir,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("empty");
  });

  it("fails write-intent task that claims no writes", () => {
    const r = validateTaskCompletion(
      task({ description: "Add a /health endpoint" }),
      workdir,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("task_expected_write_but_no_files_touched");
  });

  it("PR #82 preserve: shell_exec-only with no claimed writes fails write-intent task", () => {
    // Even though the agent ran a shell command, if it didn't actually edit/create
    // any files, the validator must reject the task.
    const r = validateTaskCompletion(
      task({ description: "Build the project" }),
      workdir,
    );
    expect(r.ok).toBe(false);
  });

  it("fails when a claimed modified file does not exist", () => {
    const r = validateTaskCompletion(
      task({ description: "Edit src/x.ts", files_modified: ["src/x.ts"] }),
      workdir,
    );
    expect(r.ok).toBe(false);
  });

  it("fails when a claimed file is a directory, not a regular file", () => {
    mkdirSync(path.join(workdir, "src/foo"), { recursive: true });
    const r = validateTaskCompletion(
      task({ description: "Create src/foo", files_created: ["src/foo"] }),
      workdir,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("not a regular file");
  });
});
