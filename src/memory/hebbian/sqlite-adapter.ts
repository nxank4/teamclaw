/**
 * SQLite adapter — provides a unified interface over bun:sqlite and better-sqlite3.
 *
 * The CLI runs on Node.js (#!/usr/bin/env node) so needs better-sqlite3.
 * Tests run under bun which doesn't support better-sqlite3's native addon.
 * This adapter detects the runtime and uses the right backend.
 */

export interface SQLiteDB {
  run(sql: string, params?: unknown[]): void;
  get(sql: string, ...params: unknown[]): unknown;
  all(sql: string, ...params: unknown[]): unknown[];
  transaction<T>(fn: () => T): () => T;
  close(): void;
}

/**
 * Open a SQLite database. Uses bun:sqlite when running in bun,
 * better-sqlite3 when running in Node.js.
 */
export function openDatabase(path: string): SQLiteDB {
  if (typeof globalThis.Bun !== "undefined") {
    return openBunSQLite(path);
  }
  return openBetterSQLite(path);
}

function openBunSQLite(path: string): SQLiteDB {
  // Dynamic require to avoid tsup trying to resolve bun:sqlite
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Database } = require("bun:sqlite");
  const db = new Database(path);
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");

  return {
    run(sql: string, params?: unknown[]): void {
      if (params && params.length > 0) {
        db.run(sql, params);
      } else {
        db.run(sql);
      }
    },
    get(sql: string, ...params: unknown[]): unknown {
      return db.query(sql).get(...params) ?? null;
    },
    all(sql: string, ...params: unknown[]): unknown[] {
      return db.query(sql).all(...params);
    },
    transaction<T>(fn: () => T): () => T {
      return db.transaction(fn);
    },
    close(): void {
      db.close();
    },
  };
}

function openBetterSQLite(path: string): SQLiteDB {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  return {
    run(sql: string, params?: unknown[]): void {
      if (params && params.length > 0) {
        db.prepare(sql).run(...params);
      } else {
        db.prepare(sql).run();
      }
    },
    get(sql: string, ...params: unknown[]): unknown {
      return db.prepare(sql).get(...params) ?? null;
    },
    all(sql: string, ...params: unknown[]): unknown[] {
      return db.prepare(sql).all(...params);
    },
    transaction<T>(fn: () => T): () => T {
      return db.transaction(fn);
    },
    close(): void {
      db.close();
    },
  };
}
