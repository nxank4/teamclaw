/**
 * Read-only codebase scan that grounds the interview-question
 * generator in real project context. Runs before the interview LLM
 * call so the model can ask file-aware questions ("which auth
 * module — src/auth/login.ts or src/auth/oauth.ts?") instead of
 * generic ones.
 *
 * Hard budgets, never advisory:
 *   - max ~8k tokens of content (default 32_000 chars at 4 chars/tok)
 *   - max 5 s wall time
 *   - never writes; only reads files under projectRoot
 *
 * When either budget trips the scan returns whatever it has so far
 * with truncated:true so the caller can flag the partial result to
 * the LLM.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, relative, sep, basename, extname } from "node:path";

/** Directories the scan never descends into. */
const IGNORED_DIRS = new Set<string>([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".turbo",
  "target",
  "__pycache__",
  ".venv",
  "venv",
  ".cache",
  ".idea",
  ".vscode",
  "coverage",
  ".pytest_cache",
  ".mypy_cache",
]);

/** Files we explicitly look for as "project conventions". */
const CONVENTION_FILES: readonly string[] = [
  "CLAUDE.md",
  "AGENTS.md",
  "package.json",
  "README.md",
  "README.markdown",
  "pyproject.toml",
  "Cargo.toml",
];

/** Per-convention-file char cap. */
const CONVENTION_FILE_CHAR_CAP = 2000;

/** Per-key-file excerpt cap. */
const KEY_FILE_EXCERPT_CAP = 4000;

/** Max number of key files to surface. */
const KEY_FILES_MAX = 10;

/** Min word length to be treated as a keyword (filters "a", "the", "is" etc.). */
const KEYWORD_MIN_LENGTH = 4;

/** Tree-walk depth. Top level = 1; immediate children = 2. */
const TREE_MAX_DEPTH = 2;

/** Default soft budgets — chosen to keep the LLM prompt well under any provider's per-call limit. */
const DEFAULT_MAX_CHARS = 32_000; // ≈ 8k tokens at ~4 chars/token
const DEFAULT_MAX_WALL_MS = 5_000;

/** Common stop-words pruned from the keyword set extracted from the prompt. */
const STOPWORDS = new Set<string>([
  "this", "that", "with", "from", "into", "have", "should",
  "would", "could", "make", "need", "want", "want", "want",
  "code", "file", "files", "function", "module", "modules",
  "across", "between", "while", "when", "where", "what", "which",
  "their", "there", "those", "these", "such", "some", "more",
  "less", "than", "then", "also", "much", "very", "really",
  "thing", "things", "stuff", "around",
]);

export interface CodebaseScanOptions {
  /** Hard cap on total content chars across keyFiles + conventions. */
  maxChars?: number;
  /** Hard cap on wall time in ms. */
  maxWallMs?: number;
  /**
   * Override clock for tests — return the current "wall time" in ms.
   * Defaults to Date.now.
   */
  now?: () => number;
}

export interface KeyFile {
  /** Project-relative path. */
  path: string;
  /** Content excerpt (capped). */
  excerpt: string;
}

export interface CodebaseContext {
  /** ASCII tree of project root, depth ≤ TREE_MAX_DEPTH, ignored dirs pruned. */
  fileTree: string;
  /** Concatenated convention-file content (CLAUDE.md, AGENTS.md, package.json, README.md...). */
  conventions: string;
  /** Files matching keywords extracted from the prompt. */
  keyFiles: KeyFile[];
  /** True when either budget tripped before the scan completed. */
  truncated: boolean;
}

/**
 * Walk the project root and assemble a CodebaseContext under the
 * given budgets. Both budgets are hard caps — they trigger an early
 * return with whatever has been gathered so far.
 */
export async function scanForInterview(
  prompt: string,
  projectRoot: string,
  options: CodebaseScanOptions = {},
): Promise<CodebaseContext> {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const maxWallMs = options.maxWallMs ?? DEFAULT_MAX_WALL_MS;
  const now = options.now ?? Date.now;
  const startedAt = now();
  const deadline = startedAt + maxWallMs;

  const root = resolve(projectRoot);
  const budget = new ContentBudget(maxChars);

  const overBudget = (): boolean => budget.exhausted() || now() >= deadline;

  // 1) File tree — small, always fits.
  const fileTree = await buildFileTree(root, TREE_MAX_DEPTH, overBudget);

  // 2) Convention files.
  const conventions = await readConventions(root, budget, overBudget);

  // 3) Keyword-matching files.
  const keyFiles = await collectKeyFiles(root, extractKeywords(prompt), budget, overBudget);

  return {
    fileTree,
    conventions,
    keyFiles,
    truncated: overBudget(),
  };
}

/** Pull > 4-char non-stopword tokens out of the prompt, lower-cased. */
export function extractKeywords(prompt: string): string[] {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9_./-]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= KEYWORD_MIN_LENGTH && !STOPWORDS.has(w));
  // Deduplicate, preserve first-seen order.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    if (!seen.has(w)) { seen.add(w); out.push(w); }
  }
  return out;
}

/** Tracks remaining content budget in characters. */
class ContentBudget {
  private remaining: number;
  constructor(capChars: number) {
    this.remaining = capChars;
  }
  /** How many chars we can still afford. */
  available(): number {
    return Math.max(0, this.remaining);
  }
  /** Charge the budget, return the actual amount consumed (clamped to available). */
  charge(chars: number): number {
    const taken = Math.min(chars, this.remaining);
    this.remaining -= taken;
    return taken;
  }
  exhausted(): boolean {
    return this.remaining <= 0;
  }
}

/** True if a directory name should be skipped during the walk. */
function isIgnoredDir(name: string): boolean {
  if (IGNORED_DIRS.has(name)) return true;
  if (name.startsWith(".") && name !== ".") {
    // Hide most dotfiles/dirs; CLAUDE.md / README.md etc. are handled separately.
    return name !== ".github" && name !== ".gitlab";
  }
  return false;
}

/**
 * Render a depth-bounded directory listing as an indented ASCII tree.
 * Returns "" if the wall-time budget trips during traversal.
 */
async function buildFileTree(
  root: string,
  maxDepth: number,
  overBudget: () => boolean,
): Promise<string> {
  const lines: string[] = [];
  await walkForTree(root, root, 0, maxDepth, lines, overBudget);
  return lines.join("\n");
}

async function walkForTree(
  root: string,
  dir: string,
  depth: number,
  maxDepth: number,
  out: string[],
  overBudget: () => boolean,
): Promise<void> {
  if (depth >= maxDepth) return;
  if (overBudget()) return;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (overBudget()) return;
    if (entry.isDirectory() && isIgnoredDir(entry.name)) continue;

    const rel = relative(root, resolve(dir, entry.name)) || entry.name;
    const indent = "  ".repeat(depth);
    const suffix = entry.isDirectory() ? "/" : "";
    out.push(`${indent}${rel.split(sep).pop()}${suffix}`);

    if (entry.isDirectory()) {
      await walkForTree(root, resolve(dir, entry.name), depth + 1, maxDepth, out, overBudget);
    }
  }
}

/** Concatenate convention files, each capped, separated by markers. */
async function readConventions(
  root: string,
  budget: ContentBudget,
  overBudget: () => boolean,
): Promise<string> {
  const parts: string[] = [];
  for (const name of CONVENTION_FILES) {
    if (overBudget()) break;
    const path = resolve(root, name);
    const content = await readFileCapped(path, CONVENTION_FILE_CHAR_CAP);
    if (!content) continue;
    const allowed = budget.charge(content.length + name.length + 16);
    if (allowed <= 0) break;
    const slice = content.slice(0, Math.max(0, allowed - (name.length + 16)));
    parts.push(`--- ${name} ---\n${slice}`);
  }
  return parts.join("\n\n");
}

/**
 * Read a file at most `cap` chars; return null when the file is
 * missing or not a regular file. Errors other than ENOENT propagate.
 */
async function readFileCapped(path: string, cap: number): Promise<string | null> {
  let stats;
  try {
    stats = await stat(path);
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
  if (!stats.isFile()) return null;
  const content = await readFile(path, "utf8");
  return content.length > cap ? content.slice(0, cap) : content;
}

/**
 * Recursively walk the project for files whose path or first chunk
 * matches any keyword. Returns up to KEY_FILES_MAX files; respects
 * the shared budget so the entire scan stays inside the cap.
 */
async function collectKeyFiles(
  root: string,
  keywords: string[],
  budget: ContentBudget,
  overBudget: () => boolean,
): Promise<KeyFile[]> {
  if (keywords.length === 0) return [];

  const out: KeyFile[] = [];
  const candidates: string[] = [];
  await walkForFiles(root, root, candidates, overBudget);

  // Rank candidates: count keyword hits in the relative path.
  const ranked = candidates
    .map((p) => ({ path: p, score: scorePathByKeywords(p, keywords) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const { path } of ranked) {
    if (out.length >= KEY_FILES_MAX) break;
    if (overBudget()) break;
    const abs = resolve(root, path);
    const content = await readFileCapped(abs, KEY_FILE_EXCERPT_CAP);
    if (!content) continue;
    const allowed = budget.charge(content.length + path.length + 8);
    if (allowed <= 0) break;
    const slice = content.slice(0, Math.max(0, allowed - (path.length + 8)));
    out.push({ path, excerpt: slice });
  }

  return out;
}

/** Walk all files in the project, prune ignored dirs, return relative paths. */
async function walkForFiles(
  root: string,
  dir: string,
  out: string[],
  overBudget: () => boolean,
): Promise<void> {
  if (overBudget()) return;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (overBudget()) return;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (isIgnoredDir(entry.name)) continue;
      await walkForFiles(root, full, out, overBudget);
    } else if (entry.isFile()) {
      const rel = relative(root, full);
      if (!isInterestingFile(rel)) continue;
      out.push(rel);
    }
  }
}

/** Heuristic: keep code-ish + doc-ish files; skip binaries/lockfiles. */
function isInterestingFile(rel: string): boolean {
  const base = basename(rel);
  const ext = extname(base).toLowerCase();
  // Lockfiles + large generated artefacts.
  if (base === "package-lock.json" || base === "bun.lockb" || base === "yarn.lock" || base === "pnpm-lock.yaml") return false;
  if (ext === ".lock" || ext === ".log") return false;
  // Common code / config / doc extensions.
  const ALLOWED = new Set<string>([
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".py", ".rs", ".go", ".java", ".kt", ".swift",
    ".rb", ".php", ".cs", ".c", ".cpp", ".h", ".hpp",
    ".md", ".mdx", ".txt",
    ".json", ".yaml", ".yml", ".toml", ".ini", ".env.example",
    ".sql",
  ]);
  if (ext === "" && (base === "Dockerfile" || base === "Makefile")) return true;
  return ALLOWED.has(ext);
}

/** Score = number of distinct keywords appearing in the path (case-insensitive). */
function scorePathByKeywords(relPath: string, keywords: string[]): number {
  const hay = relPath.toLowerCase();
  let score = 0;
  for (const k of keywords) {
    if (hay.includes(k)) score++;
  }
  return score;
}
