/**
 * Markdown agent loader.
 *
 * Parses agent definitions from `*.md` files whose body is a system
 * prompt and whose YAML frontmatter declares the routing metadata:
 *
 *   ---
 *   name: kebab-case-id          (required)
 *   description: one-line hook   (required, ≥ 20 chars)
 *   model: claude-opus-4-7       (optional)
 *   tools:                       (optional)
 *     allow: [Read, Edit, ...]
 *     deny:  [Bash]
 *   triggers: [keyword, ...]     (optional)
 *   ---
 *   You are the X. ...           (body — system prompt)
 *
 * Validation is via Zod. Field-level errors are surfaced verbatim so
 * misconfigured files fail loudly at load time.
 */

import { readFile, readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

import { parse as parseYaml } from "yaml";
import { z } from "zod";

import {
  AGENT_NAME_PATTERN,
  type AgentDefinition,
} from "../../orchestrator/types.js";

const FRONTMATTER_DELIM = "---";

const AgentFrontmatterSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .regex(AGENT_NAME_PATTERN, "name must be kebab-case (e.g. \"code-reviewer\")"),
  description: z.string().min(20, "description must be at least 20 characters"),
  model: z.string().min(1).optional(),
  tools: z
    .object({
      allow: z.array(z.string().min(1)).optional(),
      deny: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  triggers: z.array(z.string().min(1)).optional(),
});

export type AgentFrontmatter = z.infer<typeof AgentFrontmatterSchema>;

export class MarkdownAgentLoadError extends Error {
  constructor(
    public readonly sourcePath: string,
    message: string,
  ) {
    super(`${sourcePath}: ${message}`);
    this.name = "MarkdownAgentLoadError";
  }
}

interface ParsedMarkdown {
  frontmatter: unknown;
  body: string;
}

/**
 * Split a raw markdown file into frontmatter (YAML) + body. Returns null
 * if the file has no leading frontmatter block.
 */
function splitFrontmatter(raw: string): ParsedMarkdown | null {
  // Normalise leading whitespace; tolerate a BOM.
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
 * Resolve a tools.allow/deny pair into a single allow-list. When `allow`
 * is supplied, deny entries are filtered out. When `allow` is absent,
 * the result is an empty list — the agent has no tools by default.
 */
function resolveTools(spec: AgentFrontmatter["tools"]): string[] {
  const allow = spec?.allow ?? [];
  const deny = new Set(spec?.deny ?? []);
  return allow.filter((t) => !deny.has(t));
}

/**
 * Load a single agent definition from a markdown file. Throws
 * MarkdownAgentLoadError on any failure (file not found, malformed
 * frontmatter, schema violation, empty body).
 */
export async function loadAgentFromMarkdown(
  filePath: string,
): Promise<AgentDefinition> {
  const abs = resolve(filePath);
  let raw: string;
  try {
    raw = await readFile(abs, "utf8");
  } catch (err) {
    throw new MarkdownAgentLoadError(
      abs,
      `failed to read file: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const split = splitFrontmatter(raw);
  if (!split) {
    throw new MarkdownAgentLoadError(
      abs,
      "missing YAML frontmatter (expected leading '---' delimiter)",
    );
  }

  const parsed = AgentFrontmatterSchema.safeParse(split.frontmatter);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new MarkdownAgentLoadError(abs, `invalid frontmatter — ${issues}`);
  }

  const body = split.body.trim();
  if (body.length === 0) {
    throw new MarkdownAgentLoadError(abs, "system prompt body is empty");
  }

  const fm = parsed.data;
  return {
    id: fm.name,
    name: fm.name,
    description: fm.description,
    prompt: body,
    tools: resolveTools(fm.tools),
    model: fm.model,
    triggers: fm.triggers,
    sourcePath: abs,
  };
}

/**
 * Load every `*.md` file in a directory as an agent definition. Returns
 * the successful loads alongside a per-file error list — callers can
 * decide whether to fail fast or just log and skip the bad ones.
 *
 * Returns an empty list if the directory does not exist; missing
 * directories are not errors (they just mean "no agents at this level").
 */
export async function loadAgentsFromDir(
  dirPath: string,
): Promise<{
  agents: AgentDefinition[];
  errors: MarkdownAgentLoadError[];
}> {
  const abs = resolve(dirPath);
  let entries: string[];
  try {
    entries = await readdir(abs);
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return { agents: [], errors: [] };
    }
    throw err;
  }

  const mdFiles = entries
    .filter((name) => extname(name).toLowerCase() === ".md")
    .map((name) => join(abs, name));

  const agents: AgentDefinition[] = [];
  const errors: MarkdownAgentLoadError[] = [];
  for (const file of mdFiles) {
    try {
      agents.push(await loadAgentFromMarkdown(file));
    } catch (err) {
      if (err instanceof MarkdownAgentLoadError) {
        errors.push(err);
      } else {
        errors.push(
          new MarkdownAgentLoadError(
            file,
            err instanceof Error ? err.message : String(err),
          ),
        );
      }
    }
  }
  return { agents, errors };
}
