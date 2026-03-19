/**
 * Sprint Scratchpad — LanceDB-backed shared state bus for intra-sprint agent communication.
 * Ephemeral within a sprint; cleared after sprint ends.
 */

import type * as lancedb from "@lancedb/lancedb";
import type { HttpEmbeddingFunction } from "../core/knowledge-base.js";
import { logger, isDebugMode } from "../core/logger.js";

function log(msg: string): void {
  if (isDebugMode()) {
    logger.info(msg);
  }
}

const TABLE_NAME = "sprint_scratchpad";

export type ScratchpadEntryType = "discovery" | "warning" | "decision" | "artifact";

export interface ScratchpadEntry {
  id: string;
  sprintId: string;
  agentRole: string;
  type: ScratchpadEntryType;
  content: string;
  tags: string[];
  timestamp: number;
  readBy: string[];
}

export class SprintScratchpad {
  private readonly db: lancedb.Connection;
  private readonly embedder: HttpEmbeddingFunction;
  private table: lancedb.Table | null = null;
  readonly sprintId: string;

  constructor(db: lancedb.Connection, embedder: HttpEmbeddingFunction, sprintId: string) {
    this.db = db;
    this.embedder = embedder;
    this.sprintId = sprintId;
  }

  async init(): Promise<void> {
    const tableNames = await this.db.tableNames();
    if (tableNames.includes(TABLE_NAME)) {
      this.table = await this.db.openTable(TABLE_NAME);
    }
    log(`SprintScratchpad initialized for sprint ${this.sprintId}`);
  }

  async write(
    entry: Omit<ScratchpadEntry, "id" | "sprintId" | "readBy" | "timestamp">,
  ): Promise<ScratchpadEntry> {
    const embedding = await this.embed(entry.content);
    const full: ScratchpadEntry = {
      ...entry,
      id: `${this.sprintId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sprintId: this.sprintId,
      readBy: [entry.agentRole],
      timestamp: Date.now(),
    };

    const row = {
      id: full.id,
      sprint_id: full.sprintId,
      agent_role: full.agentRole,
      type: full.type,
      content: full.content,
      tags_json: JSON.stringify(full.tags),
      read_by_json: JSON.stringify(full.readBy),
      timestamp: full.timestamp,
      vector: embedding,
    };

    if (!this.table) {
      this.table = await this.db.createTable(TABLE_NAME, [row]);
    } else {
      await this.table.add([row]);
    }

    log(`Scratchpad write [${full.agentRole}]: "${full.content.slice(0, 60)}..."`);
    return full;
  }

  async read(
    query: string,
    agentRole: string,
    options: {
      limit?: number;
      type?: ScratchpadEntryType;
      excludeOwn?: boolean;
    } = {},
  ): Promise<ScratchpadEntry[]> {
    if (!this.table) return [];

    try {
      const count = await this.table.countRows();
      if (count === 0) return [];

      const embedding = await this.embed(query);
      const limit = options.limit ?? 5;

      let whereClause = `sprint_id = '${this.sprintId}'`;
      if (options.type) {
        whereClause += ` AND type = '${options.type}'`;
      }
      if (options.excludeOwn) {
        whereClause += ` AND agent_role != '${agentRole}'`;
      }

      const results = (await this.table
        .vectorSearch(embedding)
        .where(whereClause)
        .limit(Math.min(limit, count))
        .toArray()) as Array<Record<string, unknown>>;

      return results.map(rowToEntry);
    } catch (err) {
      log(`Scratchpad read failed: ${err}`);
      return [];
    }
  }

  async getAll(): Promise<ScratchpadEntry[]> {
    if (!this.table) return [];
    try {
      const rows = (await this.table
        .query()
        .where(`sprint_id = '${this.sprintId}'`)
        .toArray()) as Array<Record<string, unknown>>;
      return rows.map(rowToEntry);
    } catch (err) {
      log(`Scratchpad getAll failed: ${err}`);
      return [];
    }
  }

  async cleanup(maxAgeDays = 7): Promise<void> {
    if (!this.table) return;
    try {
      const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
      await this.table.delete(`timestamp < ${cutoff}`);
      log(`Scratchpad cleanup: removed entries older than ${maxAgeDays} days`);
    } catch (err) {
      log(`Scratchpad cleanup failed: ${err}`);
    }
  }

  private async embed(text: string): Promise<number[]> {
    const vectors = await this.embedder.generate([text]);
    return vectors[0] ?? [];
  }
}

function rowToEntry(row: Record<string, unknown>): ScratchpadEntry {
  return {
    id: String(row.id ?? ""),
    sprintId: String(row.sprint_id ?? ""),
    agentRole: String(row.agent_role ?? ""),
    type: (row.type as ScratchpadEntryType) ?? "discovery",
    content: String(row.content ?? ""),
    tags: parseJsonArray(row.tags_json),
    timestamp: Number(row.timestamp ?? 0),
    readBy: parseJsonArray(row.read_by_json),
  };
}

function parseJsonArray(raw: unknown): string[] {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Singleton map — one scratchpad per sprint, shared across all agents
const scratchpads = new Map<string, SprintScratchpad>();

export function getSprintScratchpad(
  sprintId: string,
  db: lancedb.Connection,
  embedder: HttpEmbeddingFunction,
): SprintScratchpad {
  if (!scratchpads.has(sprintId)) {
    scratchpads.set(sprintId, new SprintScratchpad(db, embedder, sprintId));
  }
  return scratchpads.get(sprintId)!;
}

export function clearSprintScratchpad(sprintId: string): void {
  scratchpads.delete(sprintId);
}

/** Visible for testing — clears entire map */
export function clearAllScratchpads(): void {
  scratchpads.clear();
}
