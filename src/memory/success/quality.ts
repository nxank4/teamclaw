/**
 * Track and score pattern quality based on retrieval outcomes.
 */

import type * as lancedb from "@lancedb/lancedb";
import type { PatternQuality } from "./types.js";
import type { SuccessPatternStore } from "./store.js";
import { logger, isDebugMode } from "../../core/logger.js";

const TABLE_NAME = "pattern_quality";

function log(msg: string): void {
  if (isDebugMode()) {
    logger.info(msg);
  }
}

export class PatternQualityStore {
  private readonly db: lancedb.Connection;
  private table: lancedb.Table | null = null;

  constructor(db: lancedb.Connection) {
    this.db = db;
  }

  async init(): Promise<void> {
    const tableNames = await this.db.tableNames();
    if (tableNames.includes(TABLE_NAME)) {
      this.table = await this.db.openTable(TABLE_NAME);
    }
  }

  async recordRetrieval(patternId: string): Promise<void> {
    const quality = await this.getQuality(patternId);
    const timesRetrieved = (quality?.timesRetrieved ?? 0) + 1;
    const timesHigh = quality?.timesResultedInHighConfidence ?? 0;
    const score = timesRetrieved > 0 ? timesHigh / timesRetrieved : 0.5;
    await this.upsert(patternId, timesRetrieved, timesHigh, score);
  }

  async recordOutcome(patternId: string, highConfidence: boolean): Promise<void> {
    const quality = await this.getQuality(patternId);
    const timesRetrieved = quality?.timesRetrieved ?? 1;
    const timesHigh = (quality?.timesResultedInHighConfidence ?? 0) + (highConfidence ? 1 : 0);
    const score = timesRetrieved > 0 ? timesHigh / timesRetrieved : 0.5;
    await this.upsert(patternId, timesRetrieved, timesHigh, score);
  }

  async getQuality(patternId: string): Promise<PatternQuality | null> {
    if (!this.table) return null;
    try {
      const rows = (await this.table
        .query()
        .where(`pattern_id = '${patternId.replace(/'/g, "''")}'`)
        .toArray()) as Array<Record<string, unknown>>;
      if (rows.length === 0) return null;
      const row = rows[0];
      return {
        patternId: String(row.pattern_id ?? ""),
        timesRetrieved: Number(row.times_retrieved ?? 0),
        timesResultedInHighConfidence: Number(row.times_high_confidence ?? 0),
        qualityScore: Number(row.quality_score ?? 0.5),
      };
    } catch {
      return null;
    }
  }

  async batchUpdate(results: Array<{ patternId: string; highConfidence: boolean }>): Promise<void> {
    for (const { patternId, highConfidence } of results) {
      await this.recordOutcome(patternId, highConfidence);
    }
  }

  private async upsert(
    patternId: string,
    timesRetrieved: number,
    timesHigh: number,
    qualityScore: number,
  ): Promise<void> {
    const row = {
      pattern_id: patternId,
      times_retrieved: timesRetrieved,
      times_high_confidence: timesHigh,
      quality_score: qualityScore,
      // LanceDB requires a vector column; use a dummy single-element vector
      vector: [0],
    };

    try {
      if (!this.table) {
        this.table = await this.db.createTable(TABLE_NAME, [row]);
      } else {
        try {
          await this.table.delete(`pattern_id = '${patternId.replace(/'/g, "''")}'`);
        } catch {
          // May not exist
        }
        await this.table.add([row]);
      }
    } catch (err) {
      log(`Failed to upsert pattern quality: ${err}`);
    }
  }
}

export async function pruneStalePatterns(
  store: SuccessPatternStore,
  qualityStore: PatternQualityStore,
  maxAgeDays = 90,
  minQuality = 0.3,
): Promise<number> {
  return store.pruneOld(maxAgeDays, minQuality);
}
