/**
 * openpawl.config.json manager.
 *
 * Keeps IO isolated and provides small helpers to read/write known keys.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type OpenpawlConfigFile = {
  path: string;
  data: Record<string, unknown>;
};

export function readOpenpawlConfig(cwd: string = process.cwd()): OpenpawlConfigFile {
  const p = path.join(cwd, "openpawl.config.json");
  if (!existsSync(p)) return { path: p, data: {} };
  try {
    const raw = readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { path: p, data: parsed as Record<string, unknown> };
    }
    return { path: p, data: {} };
  } catch {
    return { path: p, data: {} };
  }
}

export function writeOpenpawlConfig(p: string, data: Record<string, unknown>): void {
  writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function getJsonKey(key: string, data: Record<string, unknown>): unknown {
  return data[key];
}

export function setJsonKey(key: string, value: unknown, data: Record<string, unknown>): Record<string, unknown> {
  return { ...data, [key]: value };
}

export function unsetJsonKey(key: string, data: Record<string, unknown>): Record<string, unknown> {
  const next = { ...data };
  delete next[key];
  return next;
}

