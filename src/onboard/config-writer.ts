/**
 * Config writer — safely writes/merges ~/.openpawl/config.json.
 * Atomic writes (tmp → rename), proper permissions.
 */

import { mkdir, writeFile, rename, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Result, ok, err } from "neverthrow";
import type { OnboardError } from "./types.js";

function getConfigDir(): string {
  return path.join(os.homedir(), ".openpawl");
}

function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

export interface ConfigWriteOptions {
  provider: string;
  apiKey?: string;
  model: string;
  providerChain: string[];
  additionalProviders: Array<{
    provider: string;
    apiKey?: string;
    model?: string;
    baseURL?: string;
  }>;
  projectPath: string;
}

/**
 * Write the initial config file from setup wizard results.
 * Creates directory and file with proper permissions.
 */
export async function writeInitialConfig(
  options: ConfigWriteOptions,
): Promise<Result<string, OnboardError>> {
  try {
    const configDir = getConfigDir();
    await mkdir(configDir, { recursive: true, mode: 0o700 });

    const config = buildConfigObject(options);
    const configPath = getConfigPath();
    await atomicWrite(configPath, JSON.stringify(config, null, 2) + "\n");

    return ok(configPath);
  } catch (e) {
    return err({ type: "config_write_failed", cause: String(e) });
  }
}

/**
 * Merge new values into existing config (preserves session, router, etc.).
 */
export async function mergeIntoExistingConfig(
  options: Partial<ConfigWriteOptions>,
): Promise<Result<string, OnboardError>> {
  try {
    const configPath = getConfigPath();
    let existing: Record<string, unknown> = {};

    if (existsSync(configPath)) {
      try {
        const raw = await readFile(configPath, "utf-8");
        existing = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        // Corrupt config — start fresh
      }
    }

    // Build new provider entries
    const newConfig = options.provider ? buildConfigObject(options as ConfigWriteOptions) : {};

    // Deep merge: new values override, but preserve sections not in new config
    const merged = { ...existing };

    // Only update providers if new config has them
    if (newConfig.providers) {
      merged.providers = newConfig.providers;
    }
    if (newConfig.model) {
      merged.model = newConfig.model;
    }

    // Preserve version
    merged.version = 1;

    const configDir = getConfigDir();
    await mkdir(configDir, { recursive: true, mode: 0o700 });
    await atomicWrite(configPath, JSON.stringify(merged, null, 2) + "\n");

    return ok(configPath);
  } catch (e) {
    return err({ type: "config_write_failed", cause: String(e) });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildConfigObject(options: ConfigWriteOptions): Record<string, unknown> {
  const providers: Array<Record<string, unknown>> = [];

  // Primary provider
  const primary: Record<string, unknown> = { type: options.provider };
  if (options.apiKey) primary.apiKey = options.apiKey;
  if (options.model) primary.model = options.model;
  providers.push(primary);

  // Additional providers
  for (const p of options.additionalProviders) {
    const entry: Record<string, unknown> = { type: p.provider };
    if (p.apiKey) entry.apiKey = p.apiKey;
    if (p.model) entry.model = p.model;
    if (p.baseURL) entry.baseURL = p.baseURL;
    providers.push(entry);
  }

  return {
    version: 1,
    model: options.model,
    providers,
    meta: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

async function atomicWrite(filePath: string, data: string): Promise<void> {
  const tmpPath = filePath + ".tmp";
  await writeFile(tmpPath, data, { encoding: "utf-8", mode: 0o600 });
  await rename(tmpPath, filePath);
}
