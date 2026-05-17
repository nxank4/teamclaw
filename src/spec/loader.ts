/**
 * Spec loader — parse + validate a `<slug>.md` spec file.
 *
 * Failures throw SpecLoadError with the file path prefixed so users can
 * quickly diff their on-disk frontmatter against the schema.
 */

import { readFile, readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

import { splitFrontmatter } from "../utils/frontmatter.js";

import {
  SpecFrontmatterSchema,
  type SpecDocument,
} from "./types.js";

export class SpecLoadError extends Error {
  constructor(
    public readonly sourcePath: string,
    message: string,
  ) {
    super(`${sourcePath}: ${message}`);
    this.name = "SpecLoadError";
  }
}

export async function loadSpecFromFile(path: string): Promise<SpecDocument> {
  const abs = resolve(path);
  let raw: string;
  try {
    raw = await readFile(abs, "utf8");
  } catch (err) {
    throw new SpecLoadError(
      abs,
      `failed to read file: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const split = splitFrontmatter(raw);
  if (!split) {
    throw new SpecLoadError(
      abs,
      "missing YAML frontmatter (expected leading '---' delimiter)",
    );
  }

  const parsed = SpecFrontmatterSchema.safeParse(split.frontmatter);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new SpecLoadError(abs, `invalid frontmatter — ${issues}`);
  }

  return {
    frontmatter: parsed.data,
    body: split.body,
    sourcePath: abs,
  };
}

/**
 * Load every `*.md` file from `specsDir`. Returns an empty array when
 * the directory is missing — that's the normal first-run state and not
 * an error. Malformed individual files surface as thrown SpecLoadError
 * to the caller.
 */
export async function listSpecs(specsDir: string): Promise<SpecDocument[]> {
  const abs = resolve(specsDir);
  let entries: string[];
  try {
    entries = await readdir(abs);
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return [];
    }
    throw err;
  }

  const mdFiles = entries
    .filter((name) => extname(name).toLowerCase() === ".md")
    .map((name) => join(abs, name));

  const specs: SpecDocument[] = [];
  for (const file of mdFiles) {
    specs.push(await loadSpecFromFile(file));
  }
  return specs;
}
