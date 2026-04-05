/**
 * File snapshot management for /undo.
 */

import { copyFile, rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Result, ok, err } from "neverthrow";
import type { UndoTarget, UndoResult } from "./types.js";

const MAX_SNAPSHOTS = 50;

export class UndoManager {
  private stack: UndoTarget[] = [];

  constructor(private snapshotsDir: string) {}

  async snapshot(filePath: string, agentId: string): Promise<Result<string, { type: string; cause: string }>> {
    try {
      await mkdir(this.snapshotsDir, { recursive: true });
      const ext = path.extname(filePath);
      const snapName = `${randomUUID().slice(0, 8)}_${path.basename(filePath)}${ext ? "" : ".snap"}`;
      const snapPath = path.join(this.snapshotsDir, snapName);

      if (existsSync(filePath)) {
        await copyFile(filePath, snapPath);
        this.stack.push({
          filePath,
          operation: "modified",
          agentId,
          timestamp: new Date().toISOString(),
          snapshotPath: snapPath,
        });
      } else {
        this.stack.push({
          filePath,
          operation: "created",
          agentId,
          timestamp: new Date().toISOString(),
          snapshotPath: null,
        });
      }

      // FIFO eviction
      while (this.stack.length > MAX_SNAPSHOTS) this.stack.shift();

      return ok(snapPath);
    } catch (e) {
      return err({ type: "undo_error", cause: String(e) });
    }
  }

  async undo(): Promise<Result<UndoResult, { type: string; cause: string }>> {
    const target = this.stack.pop();
    if (!target) {
      return err({ type: "undo_error", cause: "No file modifications to undo" });
    }

    try {
      if (target.operation === "modified" && target.snapshotPath) {
        await copyFile(target.snapshotPath, target.filePath);
        return ok({ filePath: target.filePath, action: "restored" });
      }

      if (target.operation === "created") {
        if (existsSync(target.filePath)) {
          await rm(target.filePath);
        }
        return ok({ filePath: target.filePath, action: "deleted" });
      }

      return err({ type: "undo_error", cause: "Cannot undo this operation" });
    } catch (e) {
      return err({ type: "undo_error", cause: String(e) });
    }
  }

  getUndoStack(): UndoTarget[] {
    return [...this.stack].reverse();
  }

  async clearSnapshots(): Promise<void> {
    this.stack = [];
  }
}
