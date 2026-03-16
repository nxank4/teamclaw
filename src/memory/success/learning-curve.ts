/**
 * Track learning curve metrics across runs.
 */

import type * as lancedb from "@lancedb/lancedb";
import type { LearningCurve, LearningCurveEntry } from "./types.js";
import { logger, isDebugMode } from "../../core/logger.js";

const TABLE_NAME = "learning_curves";

function log(msg: string): void {
  if (isDebugMode()) {
    logger.info(msg);
  }
}

export class LearningCurveStore {
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

  async record(sessionId: string, entry: LearningCurveEntry): Promise<void> {
    const row = {
      session_id: sessionId,
      run_index: entry.runIndex,
      average_confidence: entry.averageConfidence,
      auto_approved_count: entry.autoApprovedCount,
      patterns_used: entry.patternsUsed,
      new_patterns_stored: entry.newPatternsStored,
      created_at: Date.now(),
      // LanceDB requires a vector column
      vector: [0],
    };

    try {
      if (!this.table) {
        this.table = await this.db.createTable(TABLE_NAME, [row]);
      } else {
        await this.table.add([row]);
      }
    } catch (err) {
      log(`Failed to record learning curve entry: ${err}`);
    }
  }

  async getBySession(sessionId: string): Promise<LearningCurve> {
    if (!this.table) return { sessionId, runs: [] };
    try {
      const rows = (await this.table
        .query()
        .where(`session_id = '${sessionId.replace(/'/g, "''")}'`)
        .toArray()) as Array<Record<string, unknown>>;
      return {
        sessionId,
        runs: rows.map(toEntry).sort((a, b) => a.runIndex - b.runIndex),
      };
    } catch {
      return { sessionId, runs: [] };
    }
  }

  async getRecent(n: number): Promise<LearningCurve[]> {
    if (!this.table) return [];
    try {
      const rows = (await this.table.query().toArray()) as Array<Record<string, unknown>>;
      // Group by session_id
      const bySession = new Map<string, Array<Record<string, unknown>>>();
      for (const row of rows) {
        const sid = String(row.session_id ?? "");
        if (!bySession.has(sid)) bySession.set(sid, []);
        bySession.get(sid)!.push(row);
      }
      // Sort sessions by most recent entry
      const sessions = [...bySession.entries()]
        .map(([sessionId, sessionRows]) => ({
          sessionId,
          runs: sessionRows.map(toEntry).sort((a, b) => a.runIndex - b.runIndex),
          latestTs: Math.max(...sessionRows.map((r) => Number(r.created_at ?? 0))),
        }))
        .sort((a, b) => b.latestTs - a.latestTs)
        .slice(0, n);
      return sessions.map(({ sessionId, runs }) => ({ sessionId, runs }));
    } catch {
      return [];
    }
  }
}

function toEntry(row: Record<string, unknown>): LearningCurveEntry {
  return {
    runIndex: Number(row.run_index ?? 0),
    averageConfidence: Number(row.average_confidence ?? 0),
    autoApprovedCount: Number(row.auto_approved_count ?? 0),
    patternsUsed: Number(row.patterns_used ?? 0),
    newPatternsStored: Number(row.new_patterns_stored ?? 0),
  };
}
