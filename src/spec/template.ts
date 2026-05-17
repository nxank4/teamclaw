/**
 * Generate the canonical skeleton for a new spec file.
 *
 * Sections follow the spec-driven-development pattern: Summary → Goals
 * → Non-Goals → User Workflow → API Surface → Data Contracts → Success
 * Criteria → Open Questions. Sections are placeholders only; the user
 * fills them in via $EDITOR.
 */

import { joinFrontmatter } from "../utils/frontmatter.js";

export function generateSpecTemplate(slug: string, now: Date = new Date()): string {
  const iso = now.toISOString();
  const frontmatter = {
    slug,
    status: "draft",
    created: iso,
    last_updated: iso,
  };
  const body = `# ${slug}

## Summary

<one-paragraph elevator pitch for what this spec proposes>

## Goals

- <goal 1>
- <goal 2>

## Non-Goals

- <explicit non-goal>

## User Workflow

<step-by-step walkthrough of how a user interacts with the change>

## API Surface

<new or modified functions, slash commands, CLI flags, config keys, files on disk>

## Data Contracts

<schemas, types, file formats, persisted shapes>

## Success Criteria

- <measurable criterion 1>
- <measurable criterion 2>

## Open Questions

- <ambiguity to resolve before /approve>
`;
  return joinFrontmatter(frontmatter, body);
}
