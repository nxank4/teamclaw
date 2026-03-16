/**
 * LanceDB-backed store for success patterns.
 */

import type * as lancedb from "@lancedb/lancedb";
import type { HttpEmbeddingFunction } from "../../core/knowledge-base.js";
import type { SuccessPattern } from "./types.js";
import { buildEmbeddingText } from "./extractor.js";
import { logger, isDebugMode } from "../../core/logger.js";

const TABLE_NAME = "success_patterns";

function log(msg: string): void {
  if (isDebugMode()) {
    logger.info(msg);
  }
}

export class SuccessPatternStore {
  private readonly db: lancedb.Connection;
  private readonly embedder: HttpEmbeddingFunction;
  private table: lancedb.Table | null = null;

  constructor(db: lancedb.Connection, embedder: HttpEmbeddingFunction) {
    this.db = db;
    this.embedder = embedder;
  }

  async init(): Promise<void> {
    const tableNames = await this.db.tableNames();
    if (tableNames.includes(TABLE_NAME)) {
      this.table = await this.db.openTable(TABLE_NAME);
    }
    log(`SuccessPatternStore initialized (table exists: ${this.table !== null})`);
  }

  async upsert(pattern: SuccessPattern): Promise<boolean> {
    try {
      const embeddingText = buildEmbeddingText(pattern);
      const vector = (await this.embedder.generate([embeddingText]))[0] ?? [];
      if (!Array.isArray(vector) || vector.length === 0) {
        throw new Error("empty embedding vector");
      }

      const row = {
        id: pattern.id,
        session_id: pattern.sessionId,
        task_description: pattern.taskDescription,
        agent_role: pattern.agentRole,
        approach: pattern.approach,
        result_summary: pattern.resultSummary,
        confidence: pattern.confidence,
        approval_type: pattern.approvalType,
        rework_count: pattern.reworkCount,
        goal_context: pattern.goalContext,
        tags_json: JSON.stringify(pattern.tags),
        vector,
        created_at: pattern.createdAt,
        run_index: pattern.runIndex,
        quality_score: 0.5,
      };

      if (!this.table) {
        this.table = await this.db.createTable(TABLE_NAME, [row]);
      } else {
        // Delete existing by id then add (LanceDB has no native upsert)
        try {
          await this.table.delete(`id = '${pattern.id.replace(/'/g, "''")}'`);
        } catch {
          // Row may not exist
        }
        await this.table.add([row]);
      }

      log(`Stored success pattern: "${pattern.taskDescription.slice(0, 50)}..."`);
      return true;
    } catch (err) {
      log(`Failed to store success pattern: ${err}`);
      return false;
    }
  }

  async search(
    vector: number[],
    limit: number,
  ): Promise<Array<SuccessPattern & { _distance: number }>> {
    if (!this.table) return [];
    try {
      const count = await this.table.countRows();
      if (count === 0) return [];
      const results = (await this.table
        .vectorSearch(vector)
        .limit(Math.min(limit, count))
        .toArray()) as Array<Record<string, unknown>>;
      return results.map((row) => ({
        id: String(row.id ?? ""),
        sessionId: String(row.session_id ?? ""),
        taskDescription: String(row.task_description ?? ""),
        agentRole: String(row.agent_role ?? ""),
        approach: String(row.approach ?? ""),
        resultSummary: String(row.result_summary ?? ""),
        confidence: Number(row.confidence ?? 0),
        approvalType: (row.approval_type as "auto" | "user") ?? "user",
        reworkCount: Number(row.rework_count ?? 0),
        goalContext: String(row.goal_context ?? ""),
        tags: parseTags(row.tags_json),
        createdAt: Number(row.created_at ?? 0),
        runIndex: Number(row.run_index ?? 0),
        _distance: Number(row._distance ?? 0),
      }));
    } catch (err) {
      log(`Success pattern search failed: ${err}`);
      return [];
    }
  }

  async getAll(): Promise<SuccessPattern[]> {
    if (!this.table) return [];
    try {
      const rows = (await this.table.query().toArray()) as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        id: String(row.id ?? ""),
        sessionId: String(row.session_id ?? ""),
        taskDescription: String(row.task_description ?? ""),
        agentRole: String(row.agent_role ?? ""),
        approach: String(row.approach ?? ""),
        resultSummary: String(row.result_summary ?? ""),
        confidence: Number(row.confidence ?? 0),
        approvalType: (row.approval_type as "auto" | "user") ?? "user",
        reworkCount: Number(row.rework_count ?? 0),
        goalContext: String(row.goal_context ?? ""),
        tags: parseTags(row.tags_json),
        createdAt: Number(row.created_at ?? 0),
        runIndex: Number(row.run_index ?? 0),
      }));
    } catch (err) {
      log(`Failed to get all success patterns: ${err}`);
      return [];
    }
  }

  async delete(id: string): Promise<boolean> {
    if (!this.table) return false;
    try {
      await this.table.delete(`id = '${id.replace(/'/g, "''")}'`);
      return true;
    } catch (err) {
      log(`Failed to delete success pattern ${id}: ${err}`);
      return false;
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

  async pruneOld(maxAgeDays: number, minQuality: number): Promise<number> {
    if (!this.table) return 0;
    try {
      const cutoffTs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
      const rows = (await this.table.query().toArray()) as Array<Record<string, unknown>>;
      const toDelete = rows.filter(
        (r) =>
          Number(r.created_at ?? 0) < cutoffTs &&
          Number(r.quality_score ?? 0.5) < minQuality,
      );
      for (const row of toDelete) {
        const id = String(row.id ?? "");
        if (id) {
          await this.table.delete(`id = '${id.replace(/'/g, "''")}'`);
        }
      }
      if (toDelete.length > 0) {
        log(`Pruned ${toDelete.length} stale success patterns`);
      }
      return toDelete.length;
    } catch (err) {
      log(`Failed to prune success patterns: ${err}`);
      return 0;
    }
  }
}

function parseTags(raw: unknown): string[] {
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
