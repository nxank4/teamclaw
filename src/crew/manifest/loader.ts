/**
 * Manifest loader.
 *
 * Reads `manifest.yaml` from a crew directory, resolves each agent's
 * `prompt_file` (relative to the crew dir) into the inlined `prompt` field,
 * and validates the result against {@link CrewManifestSchema}.
 *
 * The loader does NOT apply cross-field business rules (constraint counts,
 * write_scope sanity, duplicate agent ids) — that lives in `validator.ts`.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";

import { debugLog } from "../../debug/logger.js";
import { getActiveModel as defaultGetActiveModel } from "../../core/provider-config.js";
import {
  BUILT_IN_PRESETS,
  builtInPresetDir,
  builtInPresetExists,
} from "./presets.js";
import {
  CrewManifestSchema,
  RawCrewManifestSchema,
  type AgentDefinition,
  type CrewManifest,
} from "./types.js";

export const MANIFEST_FILENAME = "manifest.yaml";

/**
 * Sentinel that means "use the user's currently active model" — the
 * built-in presets ship with this so a single manifest works across
 * any provider/model combo. The loader rewrites it before validation.
 */
export const DEFAULT_MODEL_SENTINEL = "default";

export class ManifestModelError extends Error {
  constructor(
    message: string,
    public readonly reason:
      | "no_active_model_configured"
      | "model_resolution_failed",
  ) {
    super(message);
    this.name = "ManifestModelError";
  }
}

/**
 * Resolve agent.model sentinels in a parsed manifest.
 *
 *   - `model: "default"`  → user's active model (config.activeModel)
 *   - `model` undefined   → user's active model
 *   - any other value     → kept as-is
 *
 * Throws {@link ManifestModelError} when active model is unset (fresh
 * install) so the user gets a clear "run `openpawl model set <name>`"
 * message rather than a cryptic provider-side "Model default not
 * supported" error during the first crew run.
 *
 * `getActiveModelImpl` is a test seam.
 */
export function resolveModelSentinels(
  manifest: CrewManifest,
  getActiveModelImpl: () => string = defaultGetActiveModel,
): CrewManifest {
  const needsResolution = manifest.agents.some(
    (a) => a.model === undefined || a.model === DEFAULT_MODEL_SENTINEL,
  );
  if (!needsResolution) return manifest;

  let active = "";
  try {
    active = getActiveModelImpl().trim();
  } catch (err) {
    throw new ManifestModelError(
      `failed to read active model: ${err instanceof Error ? err.message : String(err)}`,
      "model_resolution_failed",
    );
  }
  if (active.length === 0) {
    throw new ManifestModelError(
      `crew '${manifest.name}' uses model: "default" sentinel but no active model is configured. ` +
        `Run \`openpawl model set <model-name>\` (or set OPENPAWL_MODEL env var) and try again.`,
      "no_active_model_configured",
    );
  }
  return {
    ...manifest,
    agents: manifest.agents.map((a) =>
      a.model === undefined || a.model === DEFAULT_MODEL_SENTINEL
        ? { ...a, model: active }
        : a,
    ),
  };
}

export function userCrewsDir(homeDir: string = os.homedir()): string {
  return path.join(homeDir, ".openpawl", "crews");
}

export function userCrewDir(name: string, homeDir: string = os.homedir()): string {
  return path.join(userCrewsDir(homeDir), name);
}

function resolvePromptFile(crewDir: string, promptFile: string): string {
  const abs = path.isAbsolute(promptFile)
    ? promptFile
    : path.join(crewDir, promptFile);
  if (!existsSync(abs)) {
    throw new Error(`prompt_file not found: ${abs}`);
  }
  const content = readFileSync(abs, "utf-8").trim();
  if (content.length < 10) {
    throw new Error(`prompt_file is shorter than 10 characters: ${abs}`);
  }
  return content;
}

export interface LoadManifestOptions {
  /** Test seam — defaults to the real {@link getActiveModel}. */
  getActiveModelImpl?: () => string;
  /** Skip model-sentinel resolution (used by validators that operate on raw shapes). */
  skipModelResolution?: boolean;
  /**
   * Disable the built-in preset fallback. When true, only the user
   * directory at `~/.openpawl/crews/<name>/` is consulted; missing
   * manifests there throw rather than resolving to the bundled preset.
   * Used by tests that want to assert the user-override path
   * specifically. Defaults to false (built-in fallback enabled).
   */
  skipBuiltInFallback?: boolean;
}

export function loadManifestFromDir(
  crewDir: string,
  opts: LoadManifestOptions = {},
): CrewManifest {
  const manifestPath = path.join(crewDir, MANIFEST_FILENAME);
  if (!existsSync(manifestPath)) {
    throw new Error(`manifest not found: ${manifestPath}`);
  }
  const raw = YAML.parse(readFileSync(manifestPath, "utf-8"));
  const rawParsed = RawCrewManifestSchema.parse(raw);
  const agents: AgentDefinition[] = rawParsed.agents.map((a) => {
    const inlined =
      typeof a.prompt === "string" && a.prompt.trim().length >= 10
        ? a.prompt
        : resolvePromptFile(crewDir, a.prompt_file);
    return { ...a, prompt: inlined };
  });
  const parsedManifest = CrewManifestSchema.parse({ ...rawParsed, agents });
  const manifest = opts.skipModelResolution
    ? parsedManifest
    : resolveModelSentinels(parsedManifest, opts.getActiveModelImpl);
  debugLog("info", "crew", "manifest_loaded", {
    data: {
      name: manifest.name,
      agent_count: manifest.agents.length,
      dir: crewDir,
    },
  });
  return manifest;
}

/**
 * Resolve a crew by name with the user → built-in priority.
 *
 *   1. `~/.openpawl/crews/<name>/manifest.yaml` — user override.
 *      Anything the user has authored or cloned here wins.
 *   2. The bundled built-in preset at `builtInPresetDir(name)` — read
 *      in place, never copied. This eliminates the auto-seed-on-first-
 *      run failure mode from Bug Z.
 *   3. Otherwise throw — `manifest not found`. The error message names
 *      both candidate paths so the user can tell which leg failed.
 *
 * `skipBuiltInFallback` collapses the resolution to step 1 only —
 * useful in tests that want to assert pure-user behaviour.
 */
export function loadUserCrew(
  name: string,
  homeDir: string = os.homedir(),
  opts: LoadManifestOptions = {},
): CrewManifest {
  const userDir = userCrewDir(name, homeDir);
  if (existsSync(path.join(userDir, MANIFEST_FILENAME))) {
    return loadManifestFromDir(userDir, opts);
  }
  if (
    !opts.skipBuiltInFallback &&
    (BUILT_IN_PRESETS as readonly string[]).includes(name) &&
    builtInPresetExists(name)
  ) {
    return loadManifestFromDir(builtInPresetDir(name), opts);
  }
  const userPath = path.join(userDir, MANIFEST_FILENAME);
  throw new Error(
    `manifest not found: ${userPath} (and no built-in preset for '${name}')`,
  );
}

export function listUserCrewNames(homeDir: string = os.homedir()): string[] {
  const dir = userCrewsDir(homeDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}
