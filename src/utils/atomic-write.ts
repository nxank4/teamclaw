/**
 * Atomic file write — write to a temporary sibling then rename.
 *
 * The temp suffix uses crypto-random bytes so concurrent writers to the
 * same target path don't collide on the staging file. The rename is
 * atomic on POSIX filesystems; on Windows it's a single syscall but
 * may fail if the destination is read-only at the moment of rename.
 *
 * Callers must own the parent directory; this helper does not mkdir.
 * Errors are thrown verbatim — no swallowing.
 */

import { randomBytes } from "node:crypto";
import { rename, unlink, writeFile } from "node:fs/promises";

export async function writeFileAtomic(path: string, content: string): Promise<void> {
  const suffix = randomBytes(6).toString("hex");
  const tmp = `${path}.tmp.${suffix}`;
  await writeFile(tmp, content, "utf8");
  try {
    await rename(tmp, path);
  } catch (err) {
    // Best-effort cleanup of the orphaned tmp file. If unlink itself
    // fails (already gone, EACCES, etc.) re-throw the original rename
    // error so the caller sees the real cause.
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}
