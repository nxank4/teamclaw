/**
 * Vibe score persistence — stores daily score snapshots in global.db.
 */

import type * as lancedb from "@lancedb/lancedb";
import type { VibeScoreEntry } from "./types.js";
import { logger, isDebugMode } from "../core/logger.js";

const TABLE_NAME = "vibe_scores";

function log(msg: string): void {
  if (isDebugMode()) {
    logger.info(msg);
  }
}

interface VibeScoreRow {
  id: string;
  date: string;
  overall: number;
  team_trust: number;
  review_engagement: number;
  warning_response: number;
  confidence_alignment: number;
  session_count: number;
  events_json: string;
  patterns_json: string;
  tip: string;
  computed_at: number;
  vector: number[];
}

function entryToRow(entry: VibeScoreEntry): VibeScoreRow {
  return {
    id: entry.id,
    date: entry.date,
    overall: entry.overall,
    team_trust: entry.teamTrust,
    review_engagement: entry.reviewEngagement,
    warning_response: entry.warningResponse,
    confidence_alignment: entry.confidenceAlignment,
    session_count: entry.sessionCount,
    events_json: entry.eventsJson,
    patterns_json: entry.patternsJson,
    tip: entry.tip,
    computed_at: entry.computedAt,
    vector: [0],
  };
}

function rowToEntry(row: Record<string, unknown>): VibeScoreEntry {
  return {
    id: String(row.id ?? ""),
    date: String(row.date ?? ""),
    overall: Number(row.overall ?? 0),
    teamTrust: Number(row.team_trust ?? 0),
    reviewEngagement: Number(row.review_engagement ?? 0),
    warningResponse: Number(row.warning_response ?? 0),
    confidenceAlignment: Number(row.confidence_alignment ?? 0),
    sessionCount: Number(row.session_count ?? 0),
    eventsJson: String(row.events_json ?? "[]"),
    patternsJson: String(row.patterns_json ?? "[]"),
    tip: String(row.tip ?? ""),
    computedAt: Number(row.computed_at ?? 0),
  };
}

export class VibeScoreStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;

  async init(db: lancedb.Connection): Promise<void> {
    this.db = db;
    try {
      const tableNames = await db.tableNames();
      if (tableNames.includes(TABLE_NAME)) {
        this.table = await db.openTable(TABLE_NAME);
      }
      log(`VibeScoreStore initialized (table exists: ${this.table !== null})`);
    } catch (err) {
      log(`VibeScoreStore init failed: ${err}`);
    }
  }

  async upsert(entry: VibeScoreEntry): Promise<boolean> {
    if (!this.db) return false;
    try {
      const row = entryToRow(entry);
      if (!this.table) {
        this.table = await this.db.createTable(
          TABLE_NAME,
          [row as unknown as Record<string, unknown>],
        );
      } else {
        // Delete existing entry for this date, then add
        try {
          await this.table.delete(`id = '${entry.id}'`);
        } catch {
          // May not exist yet
        }
        await this.table.add([row as unknown as Record<string, unknown>]);
      }
      return true;
    } catch (err) {
      log(`Failed to upsert vibe score: ${err}`);
      return false;
    }
  }

  async getAll(): Promise<VibeScoreEntry[]> {
    if (!this.table) return [];
    try {
      const rows = (await this.table.query().toArray()) as Array<Record<string, unknown>>;
      return rows.map(rowToEntry).sort((a, b) => b.date.localeCompare(a.date));
    } catch (err) {
      log(`Failed to get vibe scores: ${err}`);
      return [];
    }
  }

  async getRecent(days: number): Promise<VibeScoreEntry[]> {
    const all = await this.getAll();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return all.filter((e) => e.date >= cutoffStr);
  }

  async getLatest(): Promise<VibeScoreEntry | null> {
    const all = await this.getAll();
    return all[0] ?? null;
  }
}
