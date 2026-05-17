/**
 * Orchestrator-local types. Markdown-frontmatter-driven AgentDefinition
 * plus the WRITE_TOOLS set the capability gate consults.
 *
 * Field names match the legacy crew/manifest AgentDefinition where the
 * runner read them (id, name, description, prompt, tools, write_scope,
 * model) so the extraction is a move, not a rewrite. The markdown
 * loader (src/agents/registry/markdown-loader.ts) populates these from
 * frontmatter at load time.
 */

export const AGENT_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

export interface AgentDefinition {
  /** Stable kebab-case identifier. Loaded from markdown frontmatter `name`. */
  id: string;
  /** Display name (defaults to id). */
  name: string;
  /** One-line summary the dispatcher matches user task text against. */
  description: string;
  /** System prompt body (markdown content past the frontmatter). */
  prompt: string;
  /** Allowed tool names. The capability gate denies anything not in this list. */
  tools: readonly string[];
  /** Optional write-path globs. When set, file write/edit calls outside scope are denied. */
  write_scope?: readonly string[];
  /** Optional model override. */
  model?: string;
  /** Optional disk-path source (used by the loader, not the runner). */
  prompt_file?: string;
  /** Keyword triggers used by the dispatcher's fallback when the embedder is unreachable. */
  triggers?: readonly string[];
  /** Absolute path of the agent's source file when loaded from markdown. */
  sourcePath?: string;
}

/**
 * Tool names that may mutate the workspace. The capability gate consults
 * this set to decide whether to enforce write_scope and whether to
 * acquire a write lock before invocation. Includes the OpenPawl-native
 * tool names plus the legacy crew tool names that the existing crew
 * manifest fixtures still use during the transition period.
 */
export const WRITE_TOOLS: ReadonlySet<string> = new Set([
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
  "Bash",
  "file_write",
  "file_edit",
]);
