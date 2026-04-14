/**
 * Drift history — persists drift detection results in global.db.
 */

import type * as lancedb from "@lancedb/lancedb";
import type { DriftHistoryEntry } from "./types.js";
import { logger, isDebugMode } from "../core/logger.js";

const DRIFT_HISTORY_TABLE = "drift_history";

function log(msg: string): void {
  if (isDebugMode()) {
    logger.info(msg);
  }
}

interface DriftHistoryRow {
  id: string;
  session_id: string;
  goal_text: string;
  conflicts_json: string;
  resolution: string;
  reconsidered_json: string;
  detected_at: number;
  vector: number[];
}

function entryToRow(entry: DriftHistoryEntry, id: string): DriftHistoryRow {
  return {
    id,
    session_id: entry.sessionId,
    goal_text: entry.goalText,
    conflicts_json: JSON.stringify(entry.conflicts.map((c) => ({
      conflictId: c.conflictId,
      goalFragment: c.goalFragment,
      decisionId: c.decision.id,
      similarityScore: c.similarityScore,
      conflictType: c.conflictType,
    }))),
    resolution: entry.resolution,
    reconsidered_json: JSON.stringify(entry.reconsidered),
    detected_at: entry.detectedAt,
    vector: [0],
  };
}

function rowToEntry(row: Record<string, unknown>): DriftHistoryEntry {
  let reconsidered: string[] = [];
  try {
    reconsidered = JSON.parse(String(row.reconsidered_json ?? "[]"));
  } catch {
    reconsidered = [];
  }

  return {
    sessionId: String(row.session_id ?? ""),
    goalText: String(row.goal_text ?? ""),
    conflicts: [], // Simplified — full conflict data not stored
    resolution: (row.resolution as DriftHistoryEntry["resolution"]) ?? "proceed",
    reconsidered,
    detectedAt: Number(row.detected_at ?? 0),
  };
}

export class DriftHistoryStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;

  async init(db: lancedb.Connection): Promise<void> {
    this.db = db;
    try {
      const tableNames = await db.tableNames();
      if (tableNames.includes(DRIFT_HISTORY_TABLE)) {
        this.table = await db.openTable(DRIFT_HISTORY_TABLE);
      }
      log(`DriftHistoryStore initialized (table exists: ${this.table !== null})`);
    } catch (err) {
      log(`DriftHistoryStore init failed: ${err}`);
    }
  }

  async record(entry: DriftHistoryEntry): Promise<boolean> {
    if (!this.db) return false;
    try {
      const id = `drift-${entry.detectedAt}-${Math.random().toString(36).slice(2, 8)}`;
      const row = entryToRow(entry, id);
      if (!this.table) {
        this.table = await this.db.createTable(
          DRIFT_HISTORY_TABLE,
          [row as unknown as Record<string, unknown>],
        );
      } else {
        await this.table.add([row as unknown as Record<string, unknown>]);
      }
      return true;
    } catch (err) {
      log(`Failed to record drift history: ${err}`);
      return false;
    }
  }

  async getAll(): Promise<DriftHistoryEntry[]> {
    if (!this.table) return [];
    try {
      const rows = (await this.table.query().toArray()) as Array<Record<string, unknown>>;
      return rows.map(rowToEntry).sort((a, b) => b.detectedAt - a.detectedAt);
    } catch (err) {
      log(`Failed to get drift history: ${err}`);
      return [];
    }
  }

  async getBySession(sessionId: string): Promise<DriftHistoryEntry[]> {
    const all = await this.getAll();
    return all.filter((e) => e.sessionId === sessionId);
  }
}
