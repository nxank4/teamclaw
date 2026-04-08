/**
 * SQLite-backed storage for Hebbian memory nodes and edges.
 * Uses the sqlite-adapter to work in both bun (tests) and Node.js (CLI).
 */

import { openDatabase, type SQLiteDB } from "./sqlite-adapter.js";
import type { MemoryNode, HebbianEdge } from "./types.js";

const NODES_TABLE = `
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  strength REAL NOT NULL DEFAULT 1.0,
  activation REAL NOT NULL DEFAULT 0.0,
  importance REAL NOT NULL DEFAULT 0.5,
  category TEXT NOT NULL DEFAULT 'context',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  last_accessed_at INTEGER NOT NULL
)`;

const EDGES_TABLE = `
CREATE TABLE IF NOT EXISTS edges (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 0.0,
  co_activation_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (source_id, target_id),
  FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE
)`;

const INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id)",
  "CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id)",
  "CREATE INDEX IF NOT EXISTS idx_nodes_category ON nodes(category)",
  "CREATE INDEX IF NOT EXISTS idx_nodes_strength ON nodes(strength)",
];

export class HebbianStore {
  private db: SQLiteDB;

  constructor(dbPath: string) {
    this.db = openDatabase(dbPath);
    this.db.run(NODES_TABLE);
    this.db.run(EDGES_TABLE);
    for (const idx of INDEXES) {
      this.db.run(idx);
    }
  }

  // ── Nodes ─────────────────────────────────────────────────────────────────

  upsertNode(node: MemoryNode): void {
    this.db.run(`
      INSERT INTO nodes (id, content, strength, activation, importance, category, metadata, created_at, last_accessed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        strength = excluded.strength,
        activation = excluded.activation,
        importance = excluded.importance,
        category = excluded.category,
        metadata = excluded.metadata,
        last_accessed_at = excluded.last_accessed_at
    `,
      [node.id, node.content, node.strength, node.activation, node.importance,
       node.category, JSON.stringify(node.metadata), node.createdAt, node.lastAccessedAt],
    );
  }

  getNode(id: string): MemoryNode | null {
    const row = this.db.get("SELECT * FROM nodes WHERE id = ?", id) as NodeRow | null;
    return row ? rowToNode(row) : null;
  }

  getActiveNodes(minStrength = 0.01): MemoryNode[] {
    const rows = this.db.all(
      "SELECT * FROM nodes WHERE strength >= ?", minStrength,
    ) as NodeRow[];
    return rows.map(rowToNode);
  }

  getNodesByIds(ids: string[]): MemoryNode[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const rows = this.db.all(
      `SELECT * FROM nodes WHERE id IN (${placeholders})`, ...ids,
    ) as NodeRow[];
    return rows.map(rowToNode);
  }

  updateNodeActivation(id: string, activation: number): void {
    this.db.run("UPDATE nodes SET activation = ? WHERE id = ?", [activation, id]);
  }

  touchNode(id: string): void {
    this.db.run("UPDATE nodes SET last_accessed_at = ? WHERE id = ?", [Date.now(), id]);
  }

  updateDecay(updates: Array<{ id: string; strength: number; activation: number }>): void {
    const tx = this.db.transaction(() => {
      for (const u of updates) {
        this.db.run(
          "UPDATE nodes SET strength = ?, activation = ? WHERE id = ?",
          [u.strength, u.activation, u.id],
        );
      }
    });
    tx();
  }

  nodeCount(): number {
    const row = this.db.get("SELECT COUNT(*) as cnt FROM nodes") as { cnt: number };
    return row.cnt;
  }

  // ── Edges ─────────────────────────────────────────────────────────────────

  upsertEdge(edge: HebbianEdge): void {
    this.db.run(`
      INSERT INTO edges (source_id, target_id, weight, co_activation_count)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(source_id, target_id) DO UPDATE SET
        weight = excluded.weight,
        co_activation_count = excluded.co_activation_count
    `, [edge.sourceId, edge.targetId, edge.weight, edge.coActivationCount]);
  }

  getEdge(sourceId: string, targetId: string): HebbianEdge | null {
    const row = this.db.get(
      "SELECT * FROM edges WHERE source_id = ? AND target_id = ?",
      sourceId, targetId,
    ) as EdgeRow | null;
    return row ? rowToEdge(row) : null;
  }

  getNeighborEdges(nodeId: string): HebbianEdge[] {
    const rows = this.db.all(
      "SELECT * FROM edges WHERE source_id = ? OR target_id = ?",
      nodeId, nodeId,
    ) as EdgeRow[];
    return rows.map(rowToEdge);
  }

  getAllEdges(): HebbianEdge[] {
    const rows = this.db.all("SELECT * FROM edges") as EdgeRow[];
    return rows.map(rowToEdge);
  }

  pruneEdges(minWeight: number): number {
    const before = this.edgeCount();
    this.db.run("DELETE FROM edges WHERE weight < ?", [minWeight]);
    return before - this.edgeCount();
  }

  updateEdgeDecay(updates: Array<{ sourceId: string; targetId: string; weight: number }>): void {
    const tx = this.db.transaction(() => {
      for (const u of updates) {
        this.db.run(
          "UPDATE edges SET weight = ? WHERE source_id = ? AND target_id = ?",
          [u.weight, u.sourceId, u.targetId],
        );
      }
    });
    tx();
  }

  edgeCount(): number {
    const row = this.db.get("SELECT COUNT(*) as cnt FROM edges") as { cnt: number };
    return row.cnt;
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  getStats(): {
    nodeCount: number;
    edgeCount: number;
    avgStrength: number;
    categoryBreakdown: Record<string, number>;
  } {
    const nodeCount = this.nodeCount();
    const edgeCount = this.edgeCount();

    const avgRow = this.db.get(
      "SELECT AVG(strength) as avg FROM nodes",
    ) as { avg: number | null };

    const catRows = this.db.all(
      "SELECT category, COUNT(*) as cnt FROM nodes GROUP BY category",
    ) as Array<{ category: string; cnt: number }>;

    const categoryBreakdown: Record<string, number> = {};
    for (const r of catRows) {
      categoryBreakdown[r.category] = r.cnt;
    }

    return {
      nodeCount,
      edgeCount,
      avgStrength: avgRow.avg ?? 0,
      categoryBreakdown,
    };
  }

  close(): void {
    this.db.close();
  }
}

// ── Row types ─────────────────────────────────────────────────────────────────

interface NodeRow {
  id: string;
  content: string;
  strength: number;
  activation: number;
  importance: number;
  category: string;
  metadata: string;
  created_at: number;
  last_accessed_at: number;
}

interface EdgeRow {
  source_id: string;
  target_id: string;
  weight: number;
  co_activation_count: number;
}

function rowToNode(row: NodeRow): MemoryNode {
  return {
    id: row.id,
    content: row.content,
    strength: row.strength,
    activation: row.activation,
    importance: row.importance,
    category: row.category as MemoryNode["category"],
    metadata: JSON.parse(row.metadata),
    createdAt: row.created_at,
    lastAccessedAt: row.last_accessed_at,
  };
}

function rowToEdge(row: EdgeRow): HebbianEdge {
  return {
    sourceId: row.source_id,
    targetId: row.target_id,
    weight: row.weight,
    coActivationCount: row.co_activation_count,
  };
}
