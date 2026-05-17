/**
 * Spawn the user's $EDITOR on a file, suspending the TUI while the
 * editor owns the terminal. Resume the TUI when the editor exits.
 *
 * Editor resolution: caller-supplied override → $VISUAL → $EDITOR → "vi".
 * `vi` is the universal POSIX fallback; if it's also missing the spawn
 * will throw and the TUI is restored via the finally block.
 *
 * mtime is stat'd before and after the spawn so callers can detect
 * "user opened the file but saved nothing" with `mtimeAfter === mtimeBefore`.
 * Missing-file before mtime is treated as 0; missing after is treated as 0
 * (the editor may have deleted the file — rare but possible).
 */

import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";

import type { TUI } from "../tui/core/tui.js";

export interface OpenInEditorArgs {
  /** Absolute path to the file the editor should open. */
  path: string;
  /** TUI instance — when supplied, suspend()/resume() bracket the spawn. */
  tui?: TUI;
  /**
   * Override the editor binary. Resolved before env vars. Used by tests
   * to inject a stub command that returns deterministically.
   */
  editor?: string;
  /** Override env lookup for tests. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
}

export interface OpenInEditorResult {
  exitCode: number;
  mtimeBefore: number;
  mtimeAfter: number;
}

function resolveEditor(args: OpenInEditorArgs): string {
  const env = args.env ?? process.env;
  return args.editor ?? env.VISUAL ?? env.EDITOR ?? "vi";
}

async function statMtime(path: string): Promise<number> {
  try {
    const s = await stat(path);
    return s.mtimeMs;
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return 0;
    }
    throw err;
  }
}

export async function openInEditor(args: OpenInEditorArgs): Promise<OpenInEditorResult> {
  const editor = resolveEditor(args);
  const mtimeBefore = await statMtime(args.path);

  args.tui?.suspend();
  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(editor, [args.path], { stdio: "inherit" });
      child.once("error", (err) => reject(err));
      child.once("close", (code) => resolve(code ?? 0));
    });
    const mtimeAfter = await statMtime(args.path);
    return { exitCode, mtimeBefore, mtimeAfter };
  } finally {
    args.tui?.resume();
  }
}
