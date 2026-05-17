/**
 * Spec document types.
 *
 * Specs live as markdown files at `<specsDirectory>/<slug>.md` with
 * YAML frontmatter for routing metadata and a free-form body containing
 * the spec narrative (sections rendered by template.ts).
 */

import { z } from "zod";

export const SPEC_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const SpecStatusSchema = z.enum([
  "draft",
  "approved",
  "executing",
  "done",
  "abandoned",
]);
export type SpecStatus = z.infer<typeof SpecStatusSchema>;

export const SpecFrontmatterSchema = z.object({
  slug: z.string().regex(SPEC_SLUG_PATTERN, "slug must be kebab-case"),
  status: SpecStatusSchema.default("draft"),
  created: z.string().datetime(),
  last_updated: z.string().datetime(),
  linked_plan: z.string().optional(),
});
export type SpecFrontmatter = z.infer<typeof SpecFrontmatterSchema>;

export interface SpecDocument {
  frontmatter: SpecFrontmatter;
  body: string;
  sourcePath: string;
}
