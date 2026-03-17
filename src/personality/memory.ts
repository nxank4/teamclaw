import type * as lancedb from "@lancedb/lancedb";
import { logger, isDebugMode } from "../core/logger.js";
import type { PersonalityEvent } from "./types.js";

function log(msg: string): void {
  if (isDebugMode()) {
    logger.info(msg);
  }
}

interface PersonalityEventRow {
  id: string;
  agent_role: string;
  event_type: string;
  session_id: string;
  content: string;
  related_task_id: string;
  created_at: number;
  vector: number[];
}

function eventToRow(e: PersonalityEvent): PersonalityEventRow {
  return {
    id: e.id,
    agent_role: e.agentRole,
    event_type: e.eventType,
    session_id: e.sessionId,
    content: e.content,
    related_task_id: e.relatedTaskId ?? "",
    created_at: e.createdAt,
    vector: [0],
  };
}

function rowToEvent(row: Record<string, unknown>): PersonalityEvent {
  const relatedTaskId = String(row.related_task_id ?? "");
  return {
    id: String(row.id ?? ""),
    agentRole: String(row.agent_role ?? ""),
    eventType: String(row.event_type ?? "pushback") as PersonalityEvent["eventType"],
    sessionId: String(row.session_id ?? ""),
    content: String(row.content ?? ""),
    ...(relatedTaskId ? { relatedTaskId } : {}),
    createdAt: Number(row.created_at ?? 0),
  };
}

const TABLE_NAME = "personality_events";

export class PersonalityEventStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;

  async init(db: lancedb.Connection): Promise<void> {
    this.db = db;
    try {
      const tableNames = await db.tableNames();
      if (tableNames.includes(TABLE_NAME)) {
        this.table = await db.openTable(TABLE_NAME);
      }
      log(`Store initialized (table exists: ${this.table !== null})`);
    } catch (err) {
      log(`Init failed: ${err}`);
    }
  }

  async upsert(event: PersonalityEvent): Promise<boolean> {
    if (!this.db) return false;
    try {
      const row = eventToRow(event);
      if (!this.table) {
        this.table = await this.db.createTable(
          TABLE_NAME,
          [row as unknown as Record<string, unknown>],
        );
      } else {
        try {
          await this.table.delete(`id = '${event.id.replace(/'/g, "''")}'`);
        } catch {
          // Row may not exist yet
        }
        await this.table.add([row as unknown as Record<string, unknown>]);
      }
      return true;
    } catch (err) {
      log(`Failed to upsert: ${err}`);
      return false;
    }
  }

  async getById(id: string): Promise<PersonalityEvent | null> {
    if (!this.table) return null;
    try {
      const rows = (await this.table.query().toArray()) as Array<Record<string, unknown>>;
      const match = rows.find((r) => String(r.id) === id);
      return match ? rowToEvent(match) : null;
    } catch (err) {
      log(`Failed to getById: ${err}`);
      return null;
    }
  }

  async getAll(): Promise<PersonalityEvent[]> {
    if (!this.table) return [];
    try {
      const rows = (await this.table.query().toArray()) as Array<Record<string, unknown>>;
      return rows.map(rowToEvent).sort((a, b) => b.createdAt - a.createdAt);
    } catch (err) {
      log(`Failed to getAll: ${err}`);
      return [];
    }
  }

  async getByRole(role: string, limit = 10): Promise<PersonalityEvent[]> {
    if (!this.table) return [];
    try {
      const rows = (await this.table.query().toArray()) as Array<Record<string, unknown>>;
      return rows
        .filter((r) => String(r.agent_role) === role)
        .map(rowToEvent)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);
    } catch (err) {
      log(`Failed to getByRole: ${err}`);
      return [];
    }
  }

  async getBySession(sessionId: string): Promise<PersonalityEvent[]> {
    if (!this.table) return [];
    try {
      const rows = (await this.table.query().toArray()) as Array<Record<string, unknown>>;
      return rows
        .filter((r) => String(r.session_id) === sessionId)
        .map(rowToEvent)
        .sort((a, b) => b.createdAt - a.createdAt);
    } catch (err) {
      log(`Failed to getBySession: ${err}`);
      return [];
    }
  }

  async getRecent(days: number): Promise<PersonalityEvent[]> {
    if (!this.table) return [];
    try {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const rows = (await this.table.query().toArray()) as Array<Record<string, unknown>>;
      return rows
        .filter((r) => Number(r.created_at) >= cutoff)
        .map(rowToEvent)
        .sort((a, b) => b.createdAt - a.createdAt);
    } catch (err) {
      log(`Failed to getRecent: ${err}`);
      return [];
    }
  }

  async count(): Promise<number> {
    if (!this.table) return 0;
    try {
      return await this.table.countRows();
    } catch {
      return 0;
    }
  }
}
