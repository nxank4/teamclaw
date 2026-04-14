/**
 * PromotionEngine — promotes high-quality session patterns to global memory.
 * No LLM calls. Pure threshold-based promotion.
 */

import { randomUUID } from "node:crypto";
import type { GlobalMemoryManager } from "./store.js";
import type { SuccessPatternStore } from "../success/store.js";
import type { PatternQualityStore } from "../success/quality.js";
import type { HttpEmbeddingFunction } from "../../core/knowledge-base.js";
import type { SuccessPattern } from "../success/types.js";
import type { GlobalSuccessPattern } from "./types.js";
import { logger, isDebugMode } from "../../core/logger.js";

function log(msg: string): void {
  if (isDebugMode()) {
    logger.info(msg);
  }
}

export interface PromotionResult {
  promoted: string[];
  skipped: string[];
}

export class PromotionEngine {
  private readonly globalManager: GlobalMemoryManager;
  private readonly sessionPatternStore: SuccessPatternStore;
  private readonly qualityStore: PatternQualityStore;
  private readonly embedder: HttpEmbeddingFunction;

  constructor(
    globalManager: GlobalMemoryManager,
    sessionPatternStore: SuccessPatternStore,
    qualityStore: PatternQualityStore,
    embedder: HttpEmbeddingFunction,
  ) {
    this.globalManager = globalManager;
    this.sessionPatternStore = sessionPatternStore;
    this.qualityStore = qualityStore;
    this.embedder = embedder;
  }

  async autoPromote(sessionId: string): Promise<PromotionResult> {
    const result: PromotionResult = { promoted: [], skipped: [] };
    const globalStore = this.globalManager.getPatternStore();
    if (!globalStore) return result;

    const sessionPatterns = await this.sessionPatternStore.getAll();
    log(`Auto-promote: evaluating ${sessionPatterns.length} session patterns`);

    for (const pattern of sessionPatterns) {
      // Never promote if reworkCount >= 2
      if (pattern.reworkCount >= 2) {
        result.skipped.push(pattern.id);
        continue;
      }

      const quality = await this.qualityStore.getQuality(pattern.id);
      const qualityScore = quality?.qualityScore ?? 0.5;
      const timesRetrieved = quality?.timesRetrieved ?? 0;

      // Criteria 1: high confidence, no rework, auto-approved
      const meetsCriteria1 =
        pattern.confidence >= 0.85 &&
        pattern.reworkCount === 0 &&
        pattern.approvalType === "auto";

      // Criteria 2: quality-based — high quality score AND retrieved multiple times
      const meetsCriteria2 = qualityScore >= 0.7 && timesRetrieved >= 3;

      if (!meetsCriteria1 && !meetsCriteria2) {
        result.skipped.push(pattern.id);
        continue;
      }

      const promoted = await this.promotePattern(pattern, sessionId, "auto", qualityScore);
      if (promoted) {
        result.promoted.push(pattern.id);
      } else {
        result.skipped.push(pattern.id);
      }
    }

    if (result.promoted.length > 0) {
      log(`Auto-promote: promoted ${result.promoted.length}, skipped ${result.skipped.length}`);
    }
    return result;
  }

  async promoteById(patternId: string): Promise<boolean> {
    const patterns = await this.sessionPatternStore.getAll();
    const pattern = patterns.find((p) => p.id === patternId);
    if (!pattern) return false;

    const quality = await this.qualityStore.getQuality(patternId);
    return this.promotePattern(pattern, pattern.sessionId, "user", quality?.qualityScore ?? 0.5);
  }

  async demoteById(globalPatternId: string): Promise<boolean> {
    const globalStore = this.globalManager.getPatternStore();
    if (!globalStore) return false;
    return globalStore.delete(globalPatternId);
  }

  private async promotePattern(
    pattern: SuccessPattern,
    sessionId: string,
    promotedBy: "auto" | "user",
    qualityScore: number,
  ): Promise<boolean> {
    const globalStore = this.globalManager.getPatternStore();
    if (!globalStore) return false;

    const globalPattern: GlobalSuccessPattern = {
      ...pattern,
      id: `global-${randomUUID()}`,
      promotedAt: Date.now(),
      promotedBy,
      sourceSessionId: sessionId,
      globalQualityScore: qualityScore,
    };

    // Upsert into global store (reuses SuccessPatternStore)
    return globalStore.upsert(globalPattern);
  }
}
