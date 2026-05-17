/**
 * Spec writer — persist a SpecDocument atomically.
 *
 * Each write updates `frontmatter.last_updated` to now so the on-disk
 * mtime + the frontmatter agree. Atomicity comes from writeFileAtomic
 * (temp + rename) so a concurrent reader never sees a half-written file.
 */

import { joinFrontmatter } from "../utils/frontmatter.js";
import { writeFileAtomic } from "../utils/atomic-write.js";

import {
  SpecFrontmatterSchema,
  type SpecDocument,
  type SpecFrontmatter,
} from "./types.js";

export async function writeSpec(doc: SpecDocument, now: Date = new Date()): Promise<SpecDocument> {
  const updatedFrontmatter: SpecFrontmatter = {
    ...doc.frontmatter,
    last_updated: now.toISOString(),
  };
  // Re-validate so callers can't smuggle in invalid statuses via direct
  // object mutation. Throws on failure; the writer never produces an
  // on-disk file that wouldn't survive a subsequent loadSpecFromFile().
  SpecFrontmatterSchema.parse(updatedFrontmatter);

  const content = joinFrontmatter(
    updatedFrontmatter as unknown as Record<string, unknown>,
    doc.body,
  );
  await writeFileAtomic(doc.sourcePath, content);
  return { ...doc, frontmatter: updatedFrontmatter };
}
