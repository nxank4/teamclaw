/**
 * Plan document types.
 *
 * Plans live at `<plansDirectory>/<slug>.md` and reference a spec via
 * the optional `spec` frontmatter field (relative path). The body
 * carries a `## Tasks` section whose checklist is parsed into the
 * structured `PlanTask[]` so downstream consumers (next batch's
 * dispatcher integration) can read tasks without re-parsing markdown.
 */

import { z } from "zod";

export const PLAN_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const PlanStatusSchema = z.enum([
  "draft",
  "approved",
  "executing",
  "done",
  "abandoned",
]);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

export const PlanFrontmatterSchema = z.object({
  slug: z.string().regex(PLAN_SLUG_PATTERN, "slug must be kebab-case"),
  status: PlanStatusSchema.default("draft"),
  spec: z.string().optional(),
  created: z.string().datetime(),
  last_updated: z.string().datetime(),
});
export type PlanFrontmatter = z.infer<typeof PlanFrontmatterSchema>;

/**
 * A single parsed task from the plan body's `## Tasks` section.
 *
 * Sub-bullet recognition: any nested list item under a task whose text
 * begins with `files:`, `risks:`, or `test:` (case-insensitive) is
 * appended to the matching field. All other nested bullets are dropped
 * from the structured view but survive in the raw body for editing.
 */
export interface PlanTask {
  description: string;
  done: boolean;
  filesTouched: string[];
  risks: string[];
  testPlan: string[];
}

export interface PlanDocument {
  frontmatter: PlanFrontmatter;
  body: string;
  tasks: PlanTask[];
  sourcePath: string;
}
