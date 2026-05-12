import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_MODEL_SENTINEL,
  ManifestModelError,
  loadManifestFromDir,
  loadUserCrew,
  listUserCrewNames,
  resolveModelSentinels,
  userCrewDir,
} from "./loader.js";
import { builtInPresetDir, FULL_STACK_PRESET } from "./presets.js";
import type { CrewManifest } from "./types.js";

let homeDir: string;

beforeEach(() => {
  homeDir = mkdtempSync(path.join(os.tmpdir(), "openpawl-manifest-"));
});

afterEach(() => {
  rmSync(homeDir, { recursive: true, force: true });
});

function writeManifest(dir: string, body: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "manifest.yaml"), body, "utf-8");
}

function writeAgentMd(dir: string, relPath: string, body: string): void {
  const abs = path.join(dir, relPath);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, body, "utf-8");
}

describe("loadManifestFromDir", () => {
  it("loads a minimal valid manifest and inlines prompt files", () => {
    const dir = path.join(homeDir, "team");
    writeManifest(
      dir,
      `name: team
description: A small team
agents:
  - id: coder
    name: Coder
    description: writes code
    prompt_file: agents/coder.md
    tools: [file_read, file_write]
  - id: reviewer
    name: Reviewer
    description: reviews code
    prompt_file: agents/reviewer.md
    tools: [file_read]
`,
    );
    writeAgentMd(dir, "agents/coder.md", "You are the coder. Implement the task.");
    writeAgentMd(dir, "agents/reviewer.md", "You are the reviewer. Audit the diff.");

    const manifest = loadManifestFromDir(dir, {
      getActiveModelImpl: () => "minimax-m2.7",
    });
    expect(manifest.name).toBe("team");
    expect(manifest.agents).toHaveLength(2);
    expect(manifest.agents[0]?.prompt).toContain("Implement the task");
    expect(manifest.agents[1]?.tools).toEqual(["file_read"]);
    expect(manifest.constraints.min_agents).toBe(2);
  });

  it("throws when manifest.yaml is missing", () => {
    const dir = path.join(homeDir, "missing");
    mkdirSync(dir, { recursive: true });
    expect(() => loadManifestFromDir(dir)).toThrow(/manifest not found/);
  });

  it("throws when prompt_file does not exist", () => {
    const dir = path.join(homeDir, "team");
    writeManifest(
      dir,
      `name: team
description: x
agents:
  - id: a
    name: A
    description: a
    prompt_file: agents/a.md
    tools: [file_read]
  - id: b
    name: B
    description: b
    prompt_file: agents/b.md
    tools: [file_read]
`,
    );
    writeAgentMd(dir, "agents/a.md", "Some prompt content here.");
    // b.md intentionally absent

    expect(() => loadManifestFromDir(dir)).toThrow(/prompt_file not found/);
  });

  it("listUserCrewNames returns directories under ~/.openpawl/crews/", () => {
    expect(listUserCrewNames(homeDir)).toEqual([]);
    mkdirSync(userCrewDir("alpha", homeDir), { recursive: true });
    mkdirSync(userCrewDir("zeta", homeDir), { recursive: true });
    expect(listUserCrewNames(homeDir)).toEqual(["alpha", "zeta"]);
  });

  it("loadUserCrew loads from ~/.openpawl/crews/<name>", () => {
    const dir = userCrewDir("crew1", homeDir);
    writeManifest(
      dir,
      `name: crew1
description: x
agents:
  - id: a
    name: A
    description: a
    prompt_file: agents/a.md
    tools: [file_read]
  - id: b
    name: B
    description: b
    prompt_file: agents/b.md
    tools: [file_read]
`,
    );
    writeAgentMd(dir, "agents/a.md", "Prompt for agent a.");
    writeAgentMd(dir, "agents/b.md", "Prompt for agent b.");
    const m = loadUserCrew("crew1", homeDir, {
      getActiveModelImpl: () => "minimax-m2.7",
    });
    expect(m.agents.map((a) => a.id)).toEqual(["a", "b"]);
  });
});

describe("built-in full-stack preset", () => {
  it("loads from the bundled location with full agent set + Prompt 4 capability rules", () => {
    // No user dir, no seeding — loadUserCrew now reads the built-in
    // directly from the bundled `presets/` tree (src in dev, dist
    // alongside the CLI bundle in prod). Bug Z (manifest-not-found
    // on fresh installs caused by the auto-seed cp script flakiness)
    // cannot recur because no copy ever happens.
    expect(existsSync(userCrewDir(FULL_STACK_PRESET, homeDir))).toBe(false);

    const m = loadUserCrew(FULL_STACK_PRESET, homeDir, {
      getActiveModelImpl: () => "minimax-m2.7",
    });

    expect(m.agents.map((a) => a.id).sort()).toEqual([
      "coder",
      "planner",
      "reviewer",
      "tester",
    ]);

    const reviewer = m.agents.find((a) => a.id === "reviewer")!;
    const planner = m.agents.find((a) => a.id === "planner")!;
    expect(reviewer.tools).toEqual(["file_read", "file_list"]);
    expect(planner.tools).toEqual(["file_read", "file_list"]);

    const tester = m.agents.find((a) => a.id === "tester")!;
    expect(tester.tools).not.toContain("file_edit");
    expect(tester.tools).toContain("file_write");
    expect(tester.write_scope?.length).toBeGreaterThan(0);
    expect(tester.write_scope?.some((g) => g.includes("test"))).toBe(true);

    // No write to ~/.openpawl/crews/ ever happens — that path is
    // reserved for explicit user clones.
    expect(existsSync(userCrewDir(FULL_STACK_PRESET, homeDir))).toBe(false);
  });

  it("built-in source ships under the bundled presets directory", () => {
    // Sanity check on the build: if the dev tree is missing the
    // bundled preset, dispatch on a fresh install would fail.
    const dir = builtInPresetDir(FULL_STACK_PRESET);
    expect(existsSync(path.join(dir, "manifest.yaml"))).toBe(true);
    const agentFiles = readdirSync(path.join(dir, "agents")).sort();
    expect(agentFiles).toEqual([
      "coder.md",
      "planner.md",
      "reviewer.md",
      "tester.md",
    ]);
  });
});

// ── Model sentinel resolution ────────────────────────────────────────────

function manifestWithModels(models: Array<string | undefined>): CrewManifest {
  return {
    name: "team",
    description: "x",
    version: "1.0.0",
    constraints: {
      min_agents: 2,
      max_agents: 10,
      recommended_range: [3, 5],
      required_roles: [],
    },
    agents: models.map((m, i) => ({
      id: `a${i + 1}`,
      name: `Agent ${i + 1}`,
      description: "x",
      prompt: "you are an agent.",
      tools: ["file_read"] as const,
      ...(m !== undefined ? { model: m } : {}),
    })) as CrewManifest["agents"],
  };
}

describe("resolveModelSentinels", () => {
  it("rewrites model: 'default' to the active model", () => {
    const m = manifestWithModels([DEFAULT_MODEL_SENTINEL, "claude-sonnet-4-6"]);
    const resolved = resolveModelSentinels(m, () => "minimax-m2.7");
    expect(resolved.agents[0]?.model).toBe("minimax-m2.7");
    expect(resolved.agents[1]?.model).toBe("claude-sonnet-4-6");
  });

  it("rewrites undefined model to the active model", () => {
    const m = manifestWithModels([undefined, undefined]);
    const resolved = resolveModelSentinels(m, () => "claude-opus-4-7");
    expect(resolved.agents[0]?.model).toBe("claude-opus-4-7");
    expect(resolved.agents[1]?.model).toBe("claude-opus-4-7");
  });

  it("returns the manifest unchanged when no agent uses a sentinel", () => {
    const m = manifestWithModels(["claude-haiku-4-5", "claude-haiku-4-5"]);
    const resolved = resolveModelSentinels(m, () => "should-not-be-used");
    expect(resolved).toEqual(m);
  });

  it("throws ManifestModelError when active model is unset", () => {
    const m = manifestWithModels([DEFAULT_MODEL_SENTINEL, "x"]);
    let caught: unknown = null;
    try {
      resolveModelSentinels(m, () => "");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ManifestModelError);
    expect((caught as ManifestModelError).reason).toBe("no_active_model_configured");
  });

  it("throws ManifestModelError when getActiveModel itself throws", () => {
    const m = manifestWithModels([DEFAULT_MODEL_SENTINEL]);
    let caught: unknown = null;
    try {
      resolveModelSentinels(m, () => {
        throw new Error("config not initialized");
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ManifestModelError);
    expect((caught as ManifestModelError).reason).toBe("model_resolution_failed");
  });
});

describe("loadUserCrew — resolution priority", () => {
  it("loads the built-in preset on a fresh homeDir without writing to disk", () => {
    expect(existsSync(userCrewDir(FULL_STACK_PRESET, homeDir))).toBe(false);
    const m = loadUserCrew(FULL_STACK_PRESET, homeDir, {
      getActiveModelImpl: () => "minimax-m2.7",
    });
    expect(m.name).toBe(FULL_STACK_PRESET);
    // Crucially, the user dir is still NOT created. Built-ins are
    // read in place; the user only owns ~/.openpawl/crews/<name>/
    // when they explicitly clone (Prompt 9b).
    expect(existsSync(userCrewDir(FULL_STACK_PRESET, homeDir))).toBe(false);
  });

  it("is idempotent — repeated calls return matching manifests with no side-effects", () => {
    loadUserCrew(FULL_STACK_PRESET, homeDir, {
      getActiveModelImpl: () => "minimax-m2.7",
    });
    const m2 = loadUserCrew(FULL_STACK_PRESET, homeDir, {
      getActiveModelImpl: () => "minimax-m2.7",
    });
    expect(m2.name).toBe(FULL_STACK_PRESET);
    expect(existsSync(userCrewDir(FULL_STACK_PRESET, homeDir))).toBe(false);
  });

  it("user dir takes precedence over the built-in (override fork)", () => {
    // A user who has cloned + edited the full-stack preset gets
    // their override loaded instead of the bundled version.
    const dir = userCrewDir(FULL_STACK_PRESET, homeDir);
    writeManifest(
      dir,
      `name: ${FULL_STACK_PRESET}
description: user override
agents:
  - id: a
    name: A
    description: a
    prompt_file: agents/a.md
    tools: [file_read]
  - id: b
    name: B
    description: b
    prompt_file: agents/b.md
    tools: [file_read]
`,
    );
    writeAgentMd(dir, "agents/a.md", "user-overridden agent a prompt content");
    writeAgentMd(dir, "agents/b.md", "user-overridden agent b prompt content");

    const m = loadUserCrew(FULL_STACK_PRESET, homeDir, {
      getActiveModelImpl: () => "minimax-m2.7",
    });
    expect(m.description).toBe("user override");
    expect(m.agents.map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("skipBuiltInFallback bypasses the built-in path", () => {
    let caught: unknown = null;
    try {
      loadUserCrew(FULL_STACK_PRESET, homeDir, {
        skipBuiltInFallback: true,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect(String(caught)).toMatch(/manifest not found/);
  });

  it("throws for unknown crew names (no built-in fallback for unrecognised names)", () => {
    let caught: unknown = null;
    try {
      loadUserCrew("not-a-built-in", homeDir);
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect(String(caught)).toMatch(/manifest not found/);
  });
});

describe("loadManifestFromDir — model resolution integration", () => {
  it("resolves agent.model 'default' against injected getActiveModelImpl", () => {
    const dir = path.join(homeDir, "team");
    writeManifest(
      dir,
      `name: team
description: x
agents:
  - id: coder
    name: Coder
    description: writes code
    prompt_file: agents/coder.md
    tools: [file_read, file_write]
    model: default
  - id: reviewer
    name: Reviewer
    description: reviews
    prompt_file: agents/reviewer.md
    tools: [file_read]
`,
    );
    writeAgentMd(dir, "agents/coder.md", "you are the coder agent");
    writeAgentMd(dir, "agents/reviewer.md", "you are the reviewer agent");

    const m = loadManifestFromDir(dir, { getActiveModelImpl: () => "minimax-m2.7" });
    expect(m.agents.find((a) => a.id === "coder")?.model).toBe("minimax-m2.7");
    // reviewer had no model field → also resolved to active.
    expect(m.agents.find((a) => a.id === "reviewer")?.model).toBe("minimax-m2.7");
  });

  it("skipModelResolution leaves the sentinel in place", () => {
    const dir = path.join(homeDir, "team");
    writeManifest(
      dir,
      `name: team
description: x
agents:
  - id: coder
    name: Coder
    description: writes code
    prompt_file: agents/coder.md
    tools: [file_read, file_write]
    model: default
  - id: reviewer
    name: Reviewer
    description: reviews
    prompt_file: agents/reviewer.md
    tools: [file_read]
`,
    );
    writeAgentMd(dir, "agents/coder.md", "you are the coder agent");
    writeAgentMd(dir, "agents/reviewer.md", "you are the reviewer agent");

    const m = loadManifestFromDir(dir, { skipModelResolution: true });
    expect(m.agents.find((a) => a.id === "coder")?.model).toBe("default");
  });
});
