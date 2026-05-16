/**
 * In-process similarity helper for picking top-K agents from a registry
 * against a user's task text.
 *
 * Two paths:
 *   1. Embedder path. If an embedder URL is reachable, embed the task
 *      and the candidate descriptions, score by cosine similarity, sort
 *      desc, slice top-K above threshold.
 *   2. Keyword fallback. If the embedder fails (no service running,
 *      timeout, malformed response), fall back to a Jaccard-style
 *      token-overlap score between the task and each candidate's
 *      (description + triggers) bag.
 *
 * Description embeddings are cached on disk at
 * ~/.openpawl/agents/embeddings-cache.json keyed by sha256(description)
 * so we don't re-embed unchanged agent definitions on every dispatch.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

import { debugLog } from "../../debug/logger.js";
import type { AgentDefinition } from "../../orchestrator/types.js";

const DEFAULT_EMBED_BASE = "http://localhost:11434";
const DEFAULT_EMBED_MODEL = "nomic-embed-text";

export interface SimilarityOptions {
  /** Number of matches to return. */
  topK?: number;
  /** Minimum score for inclusion in the result. Below this, candidates are dropped. */
  threshold?: number;
  /** Force the keyword fallback even when an embedder might be reachable. Testing seam. */
  forceKeyword?: boolean;
  /** Override the embedder URL. Defaults to `OPENPAWL_EMBED_URL` env or `http://localhost:11434`. */
  embedderUrl?: string;
  /** Override the embedding model. Defaults to `OPENPAWL_EMBED_MODEL` env or `nomic-embed-text`. */
  embedderModel?: string;
  /** Override the bearer token. Defaults to `OPENPAWL_EMBED_TOKEN`. */
  embedderToken?: string;
  /** Override the cache file path. Defaults to `~/.openpawl/agents/embeddings-cache.json`. */
  cachePath?: string;
}

export interface SimilarityMatch {
  agent: AgentDefinition;
  score: number;
  /** Which scoring path produced this match. */
  source: "embedding" | "keyword";
}

interface CacheFile {
  version: 1;
  entries: Record<string, number[]>;
}

function defaultCachePath(): string {
  return resolve(homedir(), ".openpawl", "agents", "embeddings-cache.json");
}

function hashDescription(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function readCache(path: string): Promise<Map<string, number[]>> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as CacheFile;
    if (parsed.version !== 1) return new Map();
    return new Map(Object.entries(parsed.entries ?? {}));
  } catch {
    return new Map();
  }
}

async function writeCache(
  path: string,
  cache: Map<string, number[]>,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const payload: CacheFile = {
    version: 1,
    entries: Object.fromEntries(cache),
  };
  await writeFile(path, JSON.stringify(payload), "utf8");
}

/**
 * Call the embedding endpoint. Returns `null` on any failure — callers
 * should treat null as "embedder unavailable, use keyword fallback".
 */
async function embedTexts(
  texts: string[],
  opts: { url: string; model: string; token: string },
): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const body = JSON.stringify({ model: opts.model, input: texts });
  const cleanBase = opts.url.replace(/\/+$/, "");
  const openAiBase = cleanBase.endsWith("/v1") ? cleanBase : `${cleanBase}/v1`;
  const candidates = [`${openAiBase}/embeddings`, `${cleanBase}/api/embeddings`];

  for (const endpoint of candidates) {
    try {
      const res = await fetch(endpoint, { method: "POST", headers, body });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        embeddings?: number[][];
        data?: Array<{ embedding?: number[] }>;
      };
      if (Array.isArray(json.embeddings)) return json.embeddings;
      if (Array.isArray(json.data)) {
        return json.data
          .map((d) => d.embedding ?? [])
          .filter((v): v is number[] => Array.isArray(v) && v.length > 0);
      }
    } catch {
      // Try the next endpoint.
    }
  }
  return null;
}

function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "i", "you", "he", "she", "it", "we", "they", "this", "that", "to",
  "of", "in", "on", "at", "for", "by", "with", "from", "as", "and",
  "or", "but", "if", "then", "so", "do", "does", "did", "have", "has",
  "had", "can", "should", "would", "could", "will", "shall", "may",
  "might", "must", "me", "my", "your", "our", "their", "his", "her",
]);

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const tok of a) {
    if (b.has(tok)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function keywordScore(taskTokens: Set<string>, agent: AgentDefinition): number {
  const descTokens = tokenize(agent.description);
  const triggerTokens = new Set<string>();
  for (const t of agent.triggers ?? []) {
    for (const tok of tokenize(t)) triggerTokens.add(tok);
  }
  // Combine description + trigger tokens into one bag.
  const agentTokens = new Set([...descTokens, ...triggerTokens]);

  // Triggers carry an exact-match bonus: any whole trigger phrase that
  // appears verbatim in the task tokens raises the floor.
  let triggerBonus = 0;
  for (const t of agent.triggers ?? []) {
    const phraseTokens = tokenize(t);
    if (phraseTokens.size === 0) continue;
    let allPresent = true;
    for (const tok of phraseTokens) {
      if (!taskTokens.has(tok)) {
        allPresent = false;
        break;
      }
    }
    if (allPresent) triggerBonus = Math.max(triggerBonus, 0.25);
  }

  return jaccard(taskTokens, agentTokens) + triggerBonus;
}

/**
 * Pick the top-K agents most relevant to a task. Falls back to keyword
 * scoring if the embedder is unreachable or `forceKeyword` is set.
 */
export async function similarityTopK(
  task: string,
  candidates: AgentDefinition[],
  options: SimilarityOptions = {},
): Promise<SimilarityMatch[]> {
  const topK = options.topK ?? 3;
  const threshold = options.threshold ?? 0.05;

  if (candidates.length === 0 || task.trim().length === 0) return [];

  const useKeyword =
    options.forceKeyword === true ||
    process.env.OPENPAWL_DISABLE_EMBEDDER === "1";

  if (!useKeyword) {
    const url = options.embedderUrl ?? process.env.OPENPAWL_EMBED_URL ?? DEFAULT_EMBED_BASE;
    const model =
      options.embedderModel ?? process.env.OPENPAWL_EMBED_MODEL ?? DEFAULT_EMBED_MODEL;
    const token = options.embedderToken ?? process.env.OPENPAWL_EMBED_TOKEN ?? "";
    const cachePath = options.cachePath ?? defaultCachePath();

    const cache = await readCache(cachePath);
    const missing: { idx: number; hash: string; description: string }[] = [];
    const cachedVecs: (number[] | null)[] = candidates.map((c) => {
      const h = hashDescription(c.description);
      const v = cache.get(h);
      if (v) return v;
      return null;
    });
    candidates.forEach((c, idx) => {
      if (cachedVecs[idx] === null) {
        missing.push({ idx, hash: hashDescription(c.description), description: c.description });
      }
    });

    // Embed missing descriptions + the task in one round-trip.
    const toEmbed = [task, ...missing.map((m) => m.description)];
    const embeddings = await embedTexts(toEmbed, { url, model, token });

    if (embeddings && embeddings.length === toEmbed.length) {
      const taskVec = embeddings[0]!;
      missing.forEach((m, i) => {
        const vec = embeddings[i + 1];
        if (vec && vec.length > 0) {
          cachedVecs[m.idx] = vec;
          cache.set(m.hash, vec);
        }
      });
      try {
        await writeCache(cachePath, cache);
      } catch (err) {
        debugLog("warn", "orchestrator", "embedding_cache_write_failed", {
          data: { path: cachePath },
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const matches: SimilarityMatch[] = [];
      candidates.forEach((agent, idx) => {
        const vec = cachedVecs[idx];
        if (!vec) return;
        const score = cosine(taskVec, vec);
        if (score >= threshold) {
          matches.push({ agent, score, source: "embedding" });
        }
      });
      matches.sort((a, b) => b.score - a.score);
      return matches.slice(0, topK);
    }

    debugLog("info", "orchestrator", "embedder_unavailable", {
      data: { url, candidates: candidates.length },
    });
  }

  // Keyword fallback.
  const taskTokens = tokenize(task);
  const matches: SimilarityMatch[] = [];
  for (const agent of candidates) {
    const score = keywordScore(taskTokens, agent);
    if (score >= threshold) {
      matches.push({ agent, score, source: "keyword" });
    }
  }
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, topK);
}
