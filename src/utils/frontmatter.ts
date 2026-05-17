/**
 * Shared YAML frontmatter splitter for markdown documents.
 *
 * Used by the agent registry markdown loader, the spec module, and the
 * plan module. Keeps one implementation of the `---\n<yaml>\n---\n<body>`
 * parse so behaviour stays in lockstep across consumers.
 *
 * Returns null when no leading frontmatter block is present so callers
 * can decide whether that's an error (loaders) or a no-op (rendering).
 */

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export const FRONTMATTER_DELIM = "---";

export interface ParsedMarkdown {
  /** Pre-validation frontmatter — caller zod-validates. */
  frontmatter: unknown;
  /** Body content with the frontmatter block stripped and leading blank lines removed. */
  body: string;
}

export function splitFrontmatter(raw: string): ParsedMarkdown | null {
  // Tolerate a BOM on the leading character.
  const text = raw.replace(/^﻿/, "");
  if (!text.startsWith(FRONTMATTER_DELIM)) return null;

  // Find the closing delimiter on its own line.
  const lines = text.split(/\r?\n/);
  let closeIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === FRONTMATTER_DELIM) {
      closeIndex = i;
      break;
    }
  }
  if (closeIndex === -1) return null;

  const yamlBlock = lines.slice(1, closeIndex).join("\n");
  const body = lines.slice(closeIndex + 1).join("\n").trimStart();
  return { frontmatter: parseYaml(yamlBlock) as unknown, body };
}

/**
 * Render a frontmatter object + body into the standard markdown layout.
 * Sibling to splitFrontmatter — round-trip parsers can produce the same
 * shape they consume. Uses the `yaml` package's default stringification
 * (block style, double-quoted strings where needed).
 */
export function joinFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  const yamlBlock = stringifyYaml(frontmatter).trimEnd();
  const trimmedBody = body.replace(/^\n+/, "");
  return `${FRONTMATTER_DELIM}\n${yamlBlock}\n${FRONTMATTER_DELIM}\n\n${trimmedBody}`;
}
