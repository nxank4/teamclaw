/**
 * Legacy config migration.
 *
 * Strips the now-obsolete `default_mode` / `mode` fields from the user's
 * global config (execution modes were unified post v0.4 — the
 * solo/crew distinction is gone). Backs the original up to
 * `~/.openpawl/config.v0.3.bak.json` and rewrites the config without
 * the mode fields. Idempotent: gated by the `_migrated_from` field.
 *
 * The v0.3 → v0.4 `default_mode: "sprint"` → `"crew"` path is preserved
 * structurally — when sprint_template / crew_name fields are present the
 * shim still extracts the crew name into the result, so downstream
 * tooling can wire it up once multi-agent dispatch is reintroduced.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { logger } from "../core/logger.js";

export const MIGRATION_MARKER = "v0.3";
export const DEFAULT_CREW_NAME = "full-stack";
const MODE_UNIFICATION_NOTICE =
  "execution modes were unified in v0.4; see CHANGELOG";

export function getGlobalConfigPath(homeDir: string = os.homedir()): string {
  return path.join(homeDir, ".openpawl", "config.json");
}

export function getV03BackupPath(homeDir: string = os.homedir()): string {
  return path.join(homeDir, ".openpawl", "config.v0.3.bak.json");
}

export interface MigrationResult {
  status: "migrated" | "already_migrated" | "no_legacy_fields" | "no_config_file";
  configPath: string;
  backupPath?: string;
  crewName?: string;
}

interface LegacyConfigShape {
  default_mode?: string;
  mode?: string;
  sprint_template?: string;
  crew_name?: string;
  _migrated_from?: string;
  [key: string]: unknown;
}

function readRawConfig(configPath: string): LegacyConfigShape | null {
  if (!existsSync(configPath)) return null;
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as LegacyConfigShape;
  } catch {
    return null;
  }
}

export function migrateV03ConfigIfNeeded(homeDir: string = os.homedir()): MigrationResult {
  const configPath = getGlobalConfigPath(homeDir);
  const config = readRawConfig(configPath);

  if (!config) {
    return { status: "no_config_file", configPath };
  }

  if (config._migrated_from === MIGRATION_MARKER) {
    return { status: "already_migrated", configPath };
  }

  const hasLegacyModeField =
    typeof config.default_mode === "string" || typeof config.mode === "string";

  if (!hasLegacyModeField) {
    return { status: "no_legacy_fields", configPath };
  }

  const backupPath = getV03BackupPath(homeDir);
  writeFileSync(backupPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

  const crewName =
    typeof config.crew_name === "string" && config.crew_name.trim()
      ? config.crew_name.trim()
      : typeof config.sprint_template === "string" && config.sprint_template.trim()
        ? config.sprint_template.trim()
        : DEFAULT_CREW_NAME;

  const {
    default_mode: _dropMode,
    mode: _dropMode2,
    sprint_template: _dropTpl,
    ...rest
  } = config;
  void _dropMode;
  void _dropMode2;
  void _dropTpl;
  const migrated: LegacyConfigShape = {
    ...rest,
    crew_name: crewName,
    _migrated_from: MIGRATION_MARKER,
  };

  writeFileSync(configPath, JSON.stringify(migrated, null, 2) + "\n", "utf-8");
  logger.plain(MODE_UNIFICATION_NOTICE);

  return { status: "migrated", configPath, backupPath, crewName };
}
