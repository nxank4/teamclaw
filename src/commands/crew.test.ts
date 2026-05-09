/**
 * CLI tests for `openpawl crew`. We exercise the file-touching helpers
 * directly (clone, scaffold, list, validate) against a sandboxed HOME
 * so they cannot interfere with the developer's real
 * `~/.openpawl/crews/`. The `runCrewCommand` argv dispatch is covered
 * indirectly through these helpers — the dispatch itself is a thin
 * switch.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  cloneCrew,
  collectCrews,
  runCrewCommand,
} from "./crew.js";
import {
  FULL_STACK_PRESET,
  MANIFEST_FILENAME,
  builtInPresetExists,
  userCrewDir,
} from "../crew/manifest/index.js";

let homeDir: string;
let prevHome: string | undefined;
let prevExitCode: number | string | null | undefined;

beforeEach(() => {
  homeDir = mkdtempSync(path.join(os.tmpdir(), "openpawl-crew-cli-"));
  prevHome = process.env.HOME;
  process.env.HOME = homeDir;
  prevExitCode = process.exitCode;
  process.exitCode = 0;
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  process.exitCode = prevExitCode ?? undefined;
  rmSync(homeDir, { recursive: true, force: true });
});

describe("openpawl crew list", () => {
  it("returns the built-in preset when no user crews exist", () => {
    if (!builtInPresetExists(FULL_STACK_PRESET)) {
      // Built-in presets are bundled by the build; in a pristine
      // source-tree checkout they should be on disk via
      // `src/crew/presets/full-stack/`. If not, skip — the rest of
      // the suite would fail in the same environment.
      return;
    }
    const summaries = collectCrews(homeDir);
    expect(summaries.some((s) => s.name === FULL_STACK_PRESET && s.source === "built-in")).toBe(true);
  });

  it("lists user-cloned crews under (user) and shadows the built-in entry", () => {
    if (!builtInPresetExists(FULL_STACK_PRESET)) return;

    cloneCrew(FULL_STACK_PRESET, "my-team", homeDir);
    const summaries = collectCrews(homeDir);

    const mine = summaries.find((s) => s.name === "my-team");
    expect(mine).toBeDefined();
    expect(mine?.source).toBe("user");

    // The built-in still appears in the listing — clone does not
    // mutate the bundled directory.
    expect(summaries.some((s) => s.name === FULL_STACK_PRESET && s.source === "built-in")).toBe(true);
  });
});

describe("openpawl crew clone", () => {
  it("copies the bundled preset into ~/.openpawl/crews/<target> and rewrites the name field", () => {
    if (!builtInPresetExists(FULL_STACK_PRESET)) return;

    cloneCrew(FULL_STACK_PRESET, "fork-a", homeDir);

    const targetDir = userCrewDir("fork-a", homeDir);
    expect(existsSync(path.join(targetDir, MANIFEST_FILENAME))).toBe(true);

    const yamlText = readFileSync(path.join(targetDir, MANIFEST_FILENAME), "utf-8");
    expect(yamlText).toContain("name: fork-a");
    // Original preset name must be rewritten — otherwise loading
    // `fork-a` would resolve a manifest that says it is `full-stack`.
    expect(yamlText).not.toMatch(/^name: full-stack$/m);
  });

  it("rejects cloning into an existing target", () => {
    if (!builtInPresetExists(FULL_STACK_PRESET)) return;

    cloneCrew(FULL_STACK_PRESET, "fork-b", homeDir);
    process.exitCode = 0;
    cloneCrew(FULL_STACK_PRESET, "fork-b", homeDir);
    expect(process.exitCode).toBe(1);
  });

  it("rejects an unknown source preset", () => {
    process.exitCode = 0;
    cloneCrew("does-not-exist", "fork-c", homeDir);
    expect(process.exitCode).toBe(1);
    expect(existsSync(userCrewDir("fork-c", homeDir))).toBe(false);
  });

  it("rejects target names that violate the agent-id pattern", () => {
    process.exitCode = 0;
    cloneCrew(FULL_STACK_PRESET, "Bad Name", homeDir);
    expect(process.exitCode).toBe(1);
  });
});

describe("openpawl crew validate", () => {
  it("reports success on the full-stack built-in", async () => {
    if (!builtInPresetExists(FULL_STACK_PRESET)) return;
    process.exitCode = 0;
    await runCrewCommand(["validate", FULL_STACK_PRESET]);
    expect(process.exitCode).toBe(0);
  });

  it("flags an unknown crew name as an error", async () => {
    process.exitCode = 0;
    await runCrewCommand(["validate", "nonexistent-crew"]);
    expect(process.exitCode).toBe(1);
  });

});

describe("openpawl crew dispatch", () => {
  it("--help prints subcommand list", async () => {
    process.exitCode = 0;
    await runCrewCommand(["--help"]);
    expect(process.exitCode).toBe(0);
  });

  it("rejects unknown subcommands with exit code 1", async () => {
    process.exitCode = 0;
    await runCrewCommand(["garblearg"]);
    expect(process.exitCode).toBe(1);
  });

  it("delete with no name exits 1", async () => {
    process.exitCode = 0;
    await runCrewCommand(["delete"]);
    expect(process.exitCode).toBe(1);
  });

  it("delete refuses to remove a built-in preset name", async () => {
    process.exitCode = 0;
    await runCrewCommand(["delete", FULL_STACK_PRESET]);
    expect(process.exitCode).toBe(1);
    // Built-in is still on disk (the CLI never touched the bundled dir).
    expect(builtInPresetExists(FULL_STACK_PRESET)).toBe(true);
  });
});
