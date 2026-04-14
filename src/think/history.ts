/**
 * Think history — persists think session results in global.db.
 */

import type * as lancedb from "@lancedb/lancedb";
import type { ThinkHistoryEntry } from "./types.js";
import { logger, isDebugMode } from "../core/logger.js";

const THINK_HISTORY_TABLE = "think_history";

function log(msg: string): void {
  if (isDebugMode()) {
    logger.info(msg);
  }
}

interface ThinkHistoryRow {
  id: string;
  session_id: string;
  question: string;
  recommendation: string;
  confidence: number;
  saved_to_journal: number; // 0 or 1 (LanceDB doesn't support boolean)
  follow_up_count: number;
  created_at: number;
  vector: number[];
}

function entryToRow(entry: ThinkHistoryEntry, id: string): ThinkHistoryRow {
  return {
    id,
    session_id: entry.sessionId,
    question: entry.question,
    recommendation: entry.recommendation,
    confidence: entry.confidence,
    saved_to_journal: entry.savedToJournal ? 1 : 0,
    follow_up_count: entry.followUpCount,
    created_at: entry.createdAt,
    vector: [0],
  };
}

function rowToEntry(row: Record<string, unknown>): ThinkHistoryEntry {
  return {
    sessionId: String(row.session_id ?? ""),
    question: String(row.question ?? ""),
    recommendation: String(row.recommendation ?? ""),
    confidence: Number(row.confidence ?? 0),
    savedToJournal: Number(row.saved_to_journal ?? 0) === 1,
    followUpCount: Number(row.follow_up_count ?? 0),
    createdAt: Number(row.created_at ?? 0),
  };
}

export class ThinkHistoryStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;

  async init(db: lancedb.Connection): Promise<void> {
    this.db = db;
    try {
      const tableNames = await db.tableNames();
      if (tableNames.includes(THINK_HISTORY_TABLE)) {
        this.table = await db.openTable(THINK_HISTORY_TABLE);
      }
      log(`ThinkHistoryStore initialized (table exists: ${this.table !== null})`);
    } catch (err) {
      log(`ThinkHistoryStore init failed: ${err}`);
    }
  }

  async record(entry: ThinkHistoryEntry): Promise<boolean> {
    if (!this.db) return false;
    try {
      const id = `think-${entry.createdAt}-${Math.random().toString(36).slice(2, 8)}`;
      const row = entryToRow(entry, id);
      if (!this.table) {
        this.table = await this.db.createTable(
          THINK_HISTORY_TABLE,
          [row as unknown as Record<string, unknown>],
        );
      } else {
        await this.table.add([row as unknown as Record<string, unknown>]);
      }
      return true;
    } catch (err) {
      log(`Failed to record think history: ${err}`);
      return false;
    }
  }

  async getAll(): Promise<ThinkHistoryEntry[]> {
    if (!this.table) return [];
    try {
      const rows = (await this.table.query().toArray()) as Array<Record<string, unknown>>;
      return rows.map(rowToEntry).sort((a, b) => b.createdAt - a.createdAt);
    } catch (err) {
      log(`Failed to get think history: ${err}`);
      return [];
    }
  }

  async getBySessionId(sessionId: string): Promise<ThinkHistoryEntry | null> {
    const all = await this.getAll();
    return all.find((e) => e.sessionId === sessionId) ?? null;
  }
}
