/**
 * Built-in preset resolution.
 *
 * Built-in presets ship inside the package — under `src/crew/presets/`
 * in the source tree, and `dist/presets/` next to the bundled CLI. They
 * are read in place; we no longer copy them into `~/.openpawl/crews/`
 * on first run. The auto-copy path was the source of Bug Z: tsup's
 * `clean: true` deletes files but leaves empty directories, so the
 * subsequent `cp -r src/crew/presets dist/presets` saw `dist/presets/`
 * already present and nested everything one level deeper at
 * `dist/presets/presets/`. The runtime resolver then reported
 * "manifest not found" on a fresh install. Direct read + a stable
 * build script means there is nothing to copy and nothing to drop.
 *
 * Users who want to fork a built-in still have the option of an
 * explicit clone (Prompt 9b's `openpawl crew clone <name>` lands in a
 * follow-up). When their `~/.openpawl/crews/<name>/manifest.yaml`
 * exists it takes precedence over the built-in — see
 * `loadUserCrew` in `./loader.ts`.
 */

import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MANIFEST_FILENAME } from "./loader.js";

export const FULL_STACK_PRESET = "full-stack";
export const BUILT_IN_PRESETS = [FULL_STACK_PRESET] as const;

function moduleDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

/**
 * Resolve the directory containing built-in preset folders.
 *
 * - In the source tree (`src/crew/manifest/presets.ts`), this resolves to
 *   `src/crew/presets/`.
 * - In the bundled CLI (`dist/cli.js`), the build script lays the presets
 *   down next to the bundle at `dist/presets/`. We probe both candidates
 *   and return the first that exists.
 */
export function builtInPresetsDir(): string {
  const here = moduleDir();
  const candidates = [
    path.resolve(here, "..", "presets"),
    path.resolve(here, "presets"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}

export function builtInPresetDir(name: string): string {
  return path.join(builtInPresetsDir(), name);
}

/**
 * True when the named built-in preset is present on disk with a
 * manifest.yaml. The loader uses this to fall back to the bundled
 * preset when the user has not supplied an override at
 * `~/.openpawl/crews/<name>/`.
 */
export function builtInPresetExists(name: string): boolean {
  const dir = builtInPresetDir(name);
  if (!existsSync(dir)) return false;
  if (!statSync(dir).isDirectory()) return false;
  return existsSync(path.join(dir, MANIFEST_FILENAME));
}
