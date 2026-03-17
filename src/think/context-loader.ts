/**
 * Context loader for think mode.
 * Loads decisions, patterns, and profiles concurrently.
 */

import type { ThinkContext } from "./types.js";
import type { Decision } from "../journal/types.js";
import type { AgentProfile } from "../agents/profiles/types.js";

const MAX_DECISIONS = 3;
const MAX_PATTERNS = 2;

const EMPTY_CONTEXT: ThinkContext = {
  relevantDecisions: [],
  relevantPatterns: [],
  agentProfiles: { techLead: null, rfcAuthor: null },
};

async function loadDecisions(): Promise<Decision[]> {
  const { VectorMemory } = await import("../core/knowledge-base.js");
  const { CONFIG } = await import("../core/config.js");
  const vm = new VectorMemory(CONFIG.vectorStorePath, CONFIG.memoryBackend);
  await vm.init();
  const embedder = vm.getEmbedder();
  if (!embedder) return [];

  const { GlobalMemoryManager } = await import("../memory/global/store.js");
  const globalMgr = new GlobalMemoryManager();
  await globalMgr.init(embedder);
  const db = globalMgr.getDb();
  if (!db) return [];

  const { DecisionStore } = await import("../journal/store.js");
  const store = new DecisionStore();
  await store.init(db);
  return store.getAll();
}

async function loadPatterns(): Promise<string[]> {
  const { VectorMemory } = await import("../core/knowledge-base.js");
  const { CONFIG } = await import("../core/config.js");
  const vm = new VectorMemory(CONFIG.vectorStorePath, CONFIG.memoryBackend);
  await vm.init();
  const embedder = vm.getEmbedder();
  if (!embedder) return [];

  const { GlobalMemoryManager } = await import("../memory/global/store.js");
  const globalMgr = new GlobalMemoryManager();
  await globalMgr.init(embedder);
  const db = globalMgr.getDb();
  if (!db) return [];

  const { SuccessPatternStore } = await import("../memory/success/store.js");
  const store = new SuccessPatternStore(db, embedder);
  await store.init();
  const patterns = await store.getAll();
  return patterns.map((p) => p.taskDescription);
}

async function loadProfile(role: string): Promise<AgentProfile | null> {
  const { VectorMemory } = await import("../core/knowledge-base.js");
  const { CONFIG } = await import("../core/config.js");
  const vm = new VectorMemory(CONFIG.vectorStorePath, CONFIG.memoryBackend);
  await vm.init();
  const embedder = vm.getEmbedder();
  if (!embedder) return null;

  const { GlobalMemoryManager } = await import("../memory/global/store.js");
  const globalMgr = new GlobalMemoryManager();
  await globalMgr.init(embedder);
  const db = globalMgr.getDb();
  if (!db) return null;

  const { ProfileStore } = await import("../agents/profiles/store.js");
  const store = new ProfileStore();
  await store.init(db);
  return store.getByRole(role);
}

export async function loadThinkContext(
  _question: string,
): Promise<ThinkContext> {
  try {
    const [decisions, patterns, techLead, rfcAuthor] = await Promise.all([
      loadDecisions().catch(() => [] as Decision[]),
      loadPatterns().catch(() => [] as string[]),
      loadProfile("tech_lead").catch(() => null),
      loadProfile("rfc_author").catch(() => null),
    ]);

    return {
      relevantDecisions: decisions.slice(0, MAX_DECISIONS),
      relevantPatterns: patterns.slice(0, MAX_PATTERNS),
      agentProfiles: { techLead, rfcAuthor },
    };
  } catch {
    return EMPTY_CONTEXT;
  }
}
