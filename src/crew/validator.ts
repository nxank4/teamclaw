/**
 * Task completion validator — preserves spec §7.6 / PR #82 semantics.
 *
 * The original v0.3 sprint validator caught two failure patterns:
 *
 *   1. Agent claimed it created/modified a file that doesn't exist on
 *      disk (or exists but is empty).
 *   2. Agent's only side effect was a `shell_exec` call, but the task
 *      *expected* a write — `shell_exec` alone does NOT count as a
 *      completed write task. (PR #82 fix.)
 *
 * The function takes a task plus the workdir under which path claims
 * are interpreted. Paths in `files_created` / `files_modified` are
 * resolved relative to `workdir` if not absolute.
 *
 * The validator does NOT classify or decide retries — that's
 * `error-classify.ts` and the phase executor. On failure it returns a
 * structured `{ ok: false, reason }` and the caller wraps it in a
 * `validator` ErrorSignal for classification.
 */

import { existsSync, statSync } from "node:fs";
import path from "node:path";

import type { CrewTask } from "./types.js";

export interface ValidationOk {
  ok: true;
}

export interface ValidationFail {
  ok: false;
  reason: string;
  detail?: Record<string, unknown>;
}

export type ValidationResult = ValidationOk | ValidationFail;

const WRITE_INTENT_RE =
  /\b(write|edit|create|build|implement|add|modify|update|generate|scaffold|refactor)\b/i;

function isWriteIntent(task: CrewTask): boolean {
  return WRITE_INTENT_RE.test(task.description);
}

function resolveUnder(workdir: string, p: string): string {
  if (path.isAbsolute(p)) return p;
  return path.resolve(workdir, p);
}

function checkPathExistsAndNonEmpty(
  abs: string,
  claim: "created" | "modified",
): ValidationFail | null {
  if (!existsSync(abs)) {
    return {
      ok: false,
      reason: `task claimed ${claim} '${abs}' but the path does not exist`,
      detail: { claim, path: abs },
    };
  }
  let stat;
  try {
    stat = statSync(abs);
  } catch (e) {
    return {
      ok: false,
      reason: `task claimed ${claim} '${abs}' but stat failed: ${
        e instanceof Error ? e.message : String(e)
      }`,
      detail: { claim, path: abs },
    };
  }
  if (!stat.isFile()) {
    return {
      ok: false,
      reason: `task claimed ${claim} '${abs}' but it is not a regular file`,
      detail: { claim, path: abs },
    };
  }
  if (claim === "created" && stat.size === 0) {
    return {
      ok: false,
      reason: `task claimed created '${abs}' but the file is empty`,
      detail: { claim, path: abs },
    };
  }
  return null;
}

/**
 * Validate that a task's claimed file outputs match disk reality.
 *
 * Rules:
 *   - Every `files_created` path exists, is a regular file, non-empty.
 *   - Every `files_modified` path exists and is a regular file. (Empty
 *     is allowed — the modification might have been a delete-content.)
 *   - If the task's description suggests write intent (write / edit /
 *     create / build / implement / …) but neither files_created nor
 *     files_modified is populated, the task did not do what it said —
 *     `shell_exec` alone does not satisfy a write-intent task.
 *
 * `shell_exec` calls without write claims pass — read-only inspection
 * tasks are legitimate and should not be flagged.
 */
export function validateTaskCompletion(
  task: CrewTask,
  workdir: string,
): ValidationResult {
  for (const p of task.files_created) {
    const fail = checkPathExistsAndNonEmpty(resolveUnder(workdir, p), "created");
    if (fail) return fail;
  }
  for (const p of task.files_modified) {
    const fail = checkPathExistsAndNonEmpty(resolveUnder(workdir, p), "modified");
    if (fail) return fail;
  }

  const claimedAnyWrite =
    task.files_created.length > 0 || task.files_modified.length > 0;
  if (!claimedAnyWrite && isWriteIntent(task)) {
    return {
      ok: false,
      reason:
        "task_expected_write_but_no_files_touched: description implied a write but " +
        "neither files_created nor files_modified is populated; shell_exec alone " +
        "does not satisfy a write-intent task",
      detail: { description: task.description },
    };
  }

  return { ok: true };
}
