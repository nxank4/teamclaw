/**
 * Plan loader — parse + validate a plan file + extract structured tasks.
 *
 * The `## Tasks` section is scanned for `- [ ]` / `- [x]` checklist
 * items. Each item's nested sub-bullets are categorized by a leading
 * `files:`, `risks:`, or `test:` (case-insensitive) prefix and appended
 * to the matching field on PlanTask. Anything else under the task
 * remains in the raw body for editor use.
 */

import { readFile, readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

import { splitFrontmatter } from "../utils/frontmatter.js";

import {
  PlanFrontmatterSchema,
  type PlanDocument,
  type PlanTask,
} from "./types.js";

export class PlanLoadError extends Error {
  constructor(
    public readonly sourcePath: string,
    message: string,
  ) {
    super(`${sourcePath}: ${message}`);
    this.name = "PlanLoadError";
  }
}

const TASK_HEADER_RE = /^(\s*)-\s*\[(?<state>[ xX])\]\s*(?<desc>.+?)\s*$/;
const SUB_BULLET_RE = /^(\s+)-\s*(?<text>.+?)\s*$/;
const CATEGORY_PREFIXES = ["files", "risks", "test"] as const;
type CategoryPrefix = typeof CATEGORY_PREFIXES[number];

function categorize(line: string): { key: CategoryPrefix; value: string } | null {
  const colonIdx = line.indexOf(":");
  if (colonIdx <= 0) return null;
  const key = line.slice(0, colonIdx).trim().toLowerCase();
  if (!CATEGORY_PREFIXES.includes(key as CategoryPrefix)) return null;
  const value = line.slice(colonIdx + 1).trim();
  return value.length === 0
    ? null
    : { key: key as CategoryPrefix, value };
}

function splitMulti(value: string): string[] {
  // Sub-bullet values can be a single token or a comma-separated list.
  // Empty entries (e.g. trailing commas) are filtered.
  return value
    .split(/,(?![^()]*\))/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Extract the `## Tasks` section content. Returns the raw lines between
 * the `## Tasks` heading and the next `## ` heading (or end of file).
 */
function extractTasksSection(body: string): string[] {
  const lines = body.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Tasks\s*$/i.test(lines[i] ?? "")) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return [];
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i] ?? "")) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end);
}

export function parseTasks(body: string): PlanTask[] {
  const lines = extractTasksSection(body);
  const tasks: PlanTask[] = [];
  let current: PlanTask | null = null;
  let taskIndent = -1;

  const flush = () => {
    if (current) tasks.push(current);
    current = null;
    taskIndent = -1;
  };

  for (const line of lines) {
    const taskMatch = TASK_HEADER_RE.exec(line);
    if (taskMatch && taskMatch.groups) {
      flush();
      taskIndent = (taskMatch[1] ?? "").length;
      current = {
        description: taskMatch.groups.desc ?? "",
        done: (taskMatch.groups.state ?? " ").toLowerCase() === "x",
        filesTouched: [],
        risks: [],
        testPlan: [],
      };
      continue;
    }
    if (!current) continue;

    const subMatch = SUB_BULLET_RE.exec(line);
    if (!subMatch || !subMatch.groups) continue;
    const indent = (subMatch[1] ?? "").length;
    if (indent <= taskIndent) {
      // Indented less or equal than the task line — outside this task.
      flush();
      continue;
    }
    const text = subMatch.groups.text ?? "";
    const cat = categorize(text);
    if (!cat) continue;
    const values = splitMulti(cat.value);
    if (cat.key === "files") current.filesTouched.push(...values);
    else if (cat.key === "risks") current.risks.push(...values);
    else if (cat.key === "test") current.testPlan.push(...values);
  }
  flush();
  return tasks;
}

export async function loadPlanFromFile(path: string): Promise<PlanDocument> {
  const abs = resolve(path);
  let raw: string;
  try {
    raw = await readFile(abs, "utf8");
  } catch (err) {
    throw new PlanLoadError(
      abs,
      `failed to read file: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const split = splitFrontmatter(raw);
  if (!split) {
    throw new PlanLoadError(
      abs,
      "missing YAML frontmatter (expected leading '---' delimiter)",
    );
  }

  const parsed = PlanFrontmatterSchema.safeParse(split.frontmatter);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new PlanLoadError(abs, `invalid frontmatter — ${issues}`);
  }

  return {
    frontmatter: parsed.data,
    body: split.body,
    tasks: parseTasks(split.body),
    sourcePath: abs,
  };
}

export async function listPlans(plansDir: string): Promise<PlanDocument[]> {
  const abs = resolve(plansDir);
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
  const plans: PlanDocument[] = [];
  for (const file of mdFiles) {
    plans.push(await loadPlanFromFile(file));
  }
  return plans;
}
