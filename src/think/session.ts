/**
 * Think session orchestrator — manages the lifecycle of a think session:
 * creation, follow-ups, journal save, and history recording.
 */

import { randomUUID } from "node:crypto";
import type { ThinkSession } from "./types.js";
import type { Decision } from "../journal/types.js";
import { loadThinkContext } from "./context-loader.js";
import { executeThinkRound, type ExecuteOptions } from "./executor.js";
import { extractTags, extractDecisions } from "../journal/extractor.js";

const MAX_FOLLOW_UPS = 3;

export async function createThinkSession(
  question: string,
  options?: ExecuteOptions,
): Promise<ThinkSession> {
  const id = `think-${randomUUID().slice(0, 8)}`;
  const context = await loadThinkContext(question);

  const round = await executeThinkRound(question, context, options);

  return {
    id,
    question,
    context,
    rounds: [round],
    recommendation: round.recommendation,
    savedToJournal: false,
    createdAt: Date.now(),
  };
}

export async function addFollowUp(
  session: ThinkSession,
  followUpQuestion: string,
  options?: ExecuteOptions,
): Promise<ThinkSession> {
  if (session.rounds.length >= MAX_FOLLOW_UPS + 1) {
    throw new Error(`Maximum ${MAX_FOLLOW_UPS} follow-up rounds reached.`);
  }

  const round = await executeThinkRound(followUpQuestion, session.context, {
    ...options,
    previousRounds: session.rounds,
  });

  const updatedRounds = [...session.rounds, round];
  return {
    ...session,
    rounds: updatedRounds,
    recommendation: round.recommendation,
  };
}

export async function saveToJournal(session: ThinkSession): Promise<ThinkSession> {
  if (!session.recommendation || session.recommendation.choice === "Inconclusive") {
    throw new Error("Cannot save inconclusive recommendation to journal.");
  }

  // Primary path: direct mapping from structured recommendation
  let decisions: Decision[] = [mapRecommendationToDecision(session)];

  // Fallback: if direct mapping somehow fails, try extractDecisions()
  if (!decisions[0]) {
    const lastRound = session.rounds[session.rounds.length - 1];
    if (lastRound) {
      decisions = extractDecisions({
        agentRole: "coordinator",
        agentOutput: `${lastRound.techLeadPerspective}\n${lastRound.rfcAuthorPerspective}`,
        taskId: "",
        sessionId: session.id,
        runIndex: 0,
        goalContext: session.question,
        confidence: session.recommendation.confidence,
      });
    }
  }

  if (decisions.length === 0) {
    throw new Error("Could not extract a decision from the recommendation.");
  }

  // Save via DecisionStore
  const { VectorMemory } = await import("../core/knowledge-base.js");
  const { CONFIG } = await import("../core/config.js");
  const vm = new VectorMemory(CONFIG.vectorStorePath, CONFIG.memoryBackend);
  await vm.init();
  const embedder = vm.getEmbedder();
  if (embedder) {
    const { GlobalMemoryManager } = await import("../memory/global/store.js");
    const globalMgr = new GlobalMemoryManager();
    await globalMgr.init(embedder);
    const db = globalMgr.getDb();
    if (db) {
      const { DecisionStore } = await import("../journal/store.js");
      const store = new DecisionStore();
      await store.init(db);
      await store.upsert(decisions[0]);
    }
  }

  return { ...session, savedToJournal: true };
}

function mapRecommendationToDecision(session: ThinkSession): Decision {
  const rec = session.recommendation!;
  const topic = rec.choice.split(/\s+/).slice(0, 4).join(" ");
  const tags = extractTags(rec.choice, rec.reasoning);

  return {
    id: randomUUID(),
    sessionId: session.id,
    runIndex: 0,
    capturedAt: Date.now(),
    topic,
    decision: rec.choice,
    reasoning: rec.reasoning,
    recommendedBy: "coordinator",
    confidence: rec.confidence,
    taskId: "",
    goalContext: session.question,
    tags,
    embedding: [],
    status: "active",
  };
}

export async function recordToHistory(session: ThinkSession): Promise<void> {
  try {
    const { VectorMemory } = await import("../core/knowledge-base.js");
    const { CONFIG } = await import("../core/config.js");
    const vm = new VectorMemory(CONFIG.vectorStorePath, CONFIG.memoryBackend);
    await vm.init();
    const embedder = vm.getEmbedder();
    if (!embedder) return;

    const { GlobalMemoryManager } = await import("../memory/global/store.js");
    const globalMgr = new GlobalMemoryManager();
    await globalMgr.init(embedder);
    const db = globalMgr.getDb();
    if (!db) return;

    const { ThinkHistoryStore } = await import("./history.js");
    const store = new ThinkHistoryStore();
    await store.init(db);
    await store.record({
      sessionId: session.id,
      question: session.question,
      recommendation: session.recommendation?.choice ?? "Inconclusive",
      confidence: session.recommendation?.confidence ?? 0,
      savedToJournal: session.savedToJournal,
      followUpCount: session.rounds.length - 1,
      createdAt: session.createdAt,
    });
  } catch {
    // History recording is best-effort
  }
}
