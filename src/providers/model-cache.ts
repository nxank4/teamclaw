/**
 * Model cache — avoids re-fetching model lists on every setup/command.
 *
 * Stores in ~/.teamclaw/model-cache.json with 24-hour TTL.
 * Local providers (Ollama, LM Studio) bypass caching.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const CACHE_PATH = join(homedir(), ".teamclaw", "model-cache.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const LOCAL_PROVIDERS = new Set(["ollama", "lmstudio"]);

interface CacheEntry {
  fetchedAt: number;
  models: string[];
}

type CacheData = Record<string, CacheEntry>;

async function readCache(): Promise<CacheData> {
  try {
    const raw = await readFile(CACHE_PATH, "utf8");
    return JSON.parse(raw) as CacheData;
  } catch {
    return {};
  }
}

export async function getCachedModels(
  providerId: string,
): Promise<string[] | null> {
  if (LOCAL_PROVIDERS.has(providerId)) return null;
  try {
    const cache = await readCache();
    const entry = cache[providerId];
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
    return entry.models;
  } catch {
    return null;
  }
}

export async function setCachedModels(
  providerId: string,
  models: string[],
): Promise<void> {
  if (LOCAL_PROVIDERS.has(providerId)) return;
  try {
    const cache = await readCache();
    cache[providerId] = { fetchedAt: Date.now(), models };
    await mkdir(dirname(CACHE_PATH), { recursive: true });
    await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
  } catch {
    // Best-effort caching — ignore write errors
  }
}

export async function clearCache(providerId?: string): Promise<void> {
  if (providerId) {
    try {
      const cache = await readCache();
      delete cache[providerId];
      await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
    } catch {
      // ignore
    }
  } else {
    try {
      await writeFile(CACHE_PATH, "{}");
    } catch {
      // ignore
    }
  }
}

export function getCachePath(): string {
  return CACHE_PATH;
}
