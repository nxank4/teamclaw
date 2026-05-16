/**
 * Markdown-driven agent registry.
 *
 * Loads agents from three locations and assembles a single in-memory
 * registry, with later sources overriding earlier ones (project beats
 * user beats builtin):
 *
 *   1. src/agents/builtin/*.md       — ships with the binary
 *   2. ~/.openpawl/agents/*.md       — user-installed
 *   3. ./agents/*.md                 — project-local (cwd)
 *
 * The registry exposes lookup by id, listing all agents, and a fallback
 * accessor for the dispatcher's "no similarity match" path.
 */

import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { debugLog } from "../../debug/logger.js";
import type { AgentDefinition } from "../../orchestrator/types.js";

import {
  loadAgentsFromDir,
  type MarkdownAgentLoadError,
} from "./markdown-loader.js";

export const BUILTIN_FALLBACK_AGENT_ID = "builder";

export interface AgentRegistry {
  /** Every agent currently registered, project precedence applied. */
  all(): AgentDefinition[];
  /** Lookup by id (kebab-case name). null if not registered. */
  get(id: string): AgentDefinition | null;
  /**
   * The agent the dispatcher falls back to when similarity match returns
   * nothing above threshold. Defaults to the builtin "builder"; if even
   * that is missing, returns null and the dispatcher must error.
   */
  fallback(): AgentDefinition | null;
  /** Per-source loader errors surfaced for log/debug. */
  loadErrors(): MarkdownAgentLoadError[];
}

export interface LoadAgentRegistryOptions {
  /** Project-local agents dir. Defaults to "<cwd>/agents". */
  projectDir?: string;
  /** User-level agents dir. Defaults to "~/.openpawl/agents". */
  userDir?: string;
  /** Builtin dir override (testing seam). Defaults to src/agents/builtin/ resolved relative to this module. */
  builtinDir?: string;
  /** Working directory used to resolve a default `projectDir`. */
  cwd?: string;
}

/**
 * Resolve the builtin directory. In a tsx-driven dev run, `import.meta.url`
 * points at this source file under src/; in a tsup-bundled run, it points
 * at the bundled cli inside dist/. The builtin .md files must live at the
 * same relative offset in both layouts (../builtin/) — the tsup build is
 * expected to copy them; if it does not, we surface the load failure as a
 * registry error rather than crashing the process.
 */
function defaultBuiltinDir(): string {
  const here = fileURLToPath(import.meta.url);
  return resolve(dirname(here), "..", "builtin");
}

function defaultUserDir(): string {
  return resolve(homedir(), ".openpawl", "agents");
}

function defaultProjectDir(cwd: string): string {
  return resolve(cwd, "agents");
}

/**
 * Build an {@link AgentRegistry} by loading from builtin → user → project
 * in order. Later entries with the same id overwrite earlier ones (so a
 * project-local `architect.md` beats the builtin).
 */
export async function loadAgentRegistry(
  options: LoadAgentRegistryOptions = {},
): Promise<AgentRegistry> {
  const cwd = options.cwd ?? process.cwd();
  const builtinDir = options.builtinDir ?? defaultBuiltinDir();
  const userDir = options.userDir ?? defaultUserDir();
  const projectDir = options.projectDir ?? defaultProjectDir(cwd);

  const sources = [
    { label: "builtin", dir: builtinDir },
    { label: "user", dir: userDir },
    { label: "project", dir: projectDir },
  ];

  const byId = new Map<string, AgentDefinition>();
  const errors: MarkdownAgentLoadError[] = [];

  for (const { label, dir } of sources) {
    const { agents, errors: dirErrors } = await loadAgentsFromDir(dir);
    for (const agent of agents) {
      byId.set(agent.id, agent);
    }
    for (const err of dirErrors) {
      errors.push(err);
      debugLog("warn", "orchestrator", "agent_registry_load_error", {
        data: { source: label, dir, error: err.message },
      });
    }
    debugLog("debug", "orchestrator", "agent_registry_source_loaded", {
      data: { source: label, dir, agent_count: agents.length, error_count: dirErrors.length },
    });
  }

  const all = Array.from(byId.values());

  return {
    all() {
      return all;
    },
    get(id: string) {
      return byId.get(id) ?? null;
    },
    fallback() {
      return byId.get(BUILTIN_FALLBACK_AGENT_ID) ?? null;
    },
    loadErrors() {
      return errors;
    },
  };
}
