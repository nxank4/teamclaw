/**
 * Plan writer — persist a PlanDocument atomically.
 *
 * Symmetric to spec/writer.ts. The tasks array on the document is
 * advisory — the body is the source of truth and what gets written.
 * If callers mutate tasks without updating body, the next load will
 * re-parse from body and clobber the in-memory mutations.
 */

import { joinFrontmatter } from "../utils/frontmatter.js";
import { writeFileAtomic } from "../utils/atomic-write.js";

import {
  PlanFrontmatterSchema,
  type PlanDocument,
  type PlanFrontmatter,
} from "./types.js";

export async function writePlan(doc: PlanDocument, now: Date = new Date()): Promise<PlanDocument> {
  const updatedFrontmatter: PlanFrontmatter = {
    ...doc.frontmatter,
    last_updated: now.toISOString(),
  };
  PlanFrontmatterSchema.parse(updatedFrontmatter);
  const content = joinFrontmatter(
    updatedFrontmatter as unknown as Record<string, unknown>,
    doc.body,
  );
  await writeFileAtomic(doc.sourcePath, content);
  return { ...doc, frontmatter: updatedFrontmatter };
}
