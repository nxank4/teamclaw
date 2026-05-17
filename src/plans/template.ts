/**
 * Generate the canonical skeleton for a new plan file.
 *
 * Always emits a `## Tasks` section so the loader's parser has
 * something to extract even before the user edits the file. When the
 * plan is linked to a spec, the `spec` frontmatter field is populated
 * with the relative path; otherwise the field is omitted so the
 * frontmatter validator's `.optional()` branch applies.
 */

import { joinFrontmatter } from "../utils/frontmatter.js";

export interface GeneratePlanTemplateArgs {
  slug: string;
  specPath?: string;
  now?: Date;
}

export function generatePlanTemplate(args: GeneratePlanTemplateArgs): string {
  const now = args.now ?? new Date();
  const iso = now.toISOString();
  const frontmatter: Record<string, unknown> = {
    slug: args.slug,
    status: "draft",
    created: iso,
    last_updated: iso,
  };
  if (args.specPath) {
    frontmatter.spec = args.specPath;
  }
  const specLink = args.specPath
    ? `\nLinked to spec at \`${args.specPath}\`.\n`
    : "";
  const body = `# ${args.slug}
${specLink}
## Approach

<one-paragraph summary of how this plan attacks the spec's goals>

## Tasks

- [ ] <first concrete task>
  - files: <comma-separated paths the task will touch>
  - risks: <what could go wrong>
  - test: <how this task is verified>
- [ ] <second task>
  - files:
  - risks:
  - test:

## Verification

<end-to-end checks once every task is done>
`;
  return joinFrontmatter(frontmatter, body);
}
