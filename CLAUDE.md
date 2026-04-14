# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenPawl is an interactive AI agent TUI with two modes: **chat mode** (single agent responds to prompts with tool calling) and **sprint mode** (autonomous multi-agent task execution from a goal). Agents use native API tool calling, hebbian memory for learning, and context engineering for long conversations.

## Commands

- Runtime: Node **>= 20**, **bun**.
- `bun install` — install deps
- `bun run build` — build (tsup + web client)
- `bun run typecheck` — type-check (`tsc --noEmit`)
- `bun run test` — tests (bun test, NOT Vitest)
- `bun run test -- path/to/file.test.ts` — run a single test file
- `bun run test:watch` — watch mode
- `bun run lint` — lint (`eslint src/`)
- `bun run dev` — tsup watch mode
- Pre-commit hook runs: typecheck → lint → tests (all must pass)

## Architecture

### TUI Application (src/app/index.ts)

Main entry point. Interactive terminal UI with:
- Editor component for user input (multiline, history, autocomplete)
- Messages component for conversation display (tree-structured agent responses)
- Status bar, divider, thinking indicator
- Slash commands (`/sprint`, `/compact`, `/settings`, `/sessions`, `/plan`, etc.)
- Session management with persistence and recovery

### Chat Mode (src/router/)

User prompt → `PromptRouter` → intent classification → agent selection → `LLMAgentRunner` → `callLLMMultiTurn` with native tool calling → streamed response to TUI.

Key files:
- `src/router/prompt-router.ts` — routes prompts to agents, emits dispatch events
- `src/router/agent-registry.ts` — built-in agents (coder, reviewer, planner, tester, debugger, researcher, assistant)
- `src/router/llm-agent-runner.ts` — bridges agents to LLM with tool loop, doom-loop detection, context compaction
- `src/router/dispatch-strategy.ts` — sequential/parallel agent dispatch

### Sprint Mode (src/sprint/)

`/sprint <goal>` → `SprintRunner` → planner agent breaks goal into tasks → sequential execution with keyword-based agent assignment → events streamed to TUI.

- `src/sprint/sprint-runner.ts` — orchestrator with pause/resume/stop
- `src/sprint/create-sprint-runner.ts` — factory wiring to `callLLMMultiTurn`
- `src/sprint/task-parser.ts` — parses planner output (JSON or numbered list)

### LLM Engine (src/engine/llm.ts)

Three entry points:
- `callLLM(prompt, options)` — single-turn streaming
- `callLLMWithMessages(messages, options)` — multi-turn with context compression
- `callLLMMultiTurn(opts)` — agentic loop with native tool calling (handles tool calls, gets results, continues)

### Provider System (src/providers/)

Multi-provider LLM support: Anthropic, OpenAI-compatible, Bedrock, Vertex, GitHub Copilot. Auto-detection, health monitoring, model discovery, smart routing.

### Tool System (src/tools/)

Built-in tools: `file_read`, `file_write`, `file_edit`, `file_list`, `shell_exec`, `web_search`, `web_fetch`, `git_ops`, `execute_code`. Tool registry with per-agent permissions, sandboxed execution, MCP server support.

### Context Engineering (src/context/)

- `context-tracker.ts` — monitors token utilization, triggers compaction at thresholds
- `compaction.ts` — three strategies: tool result masking (high), message pruning (critical), LLM summarization (emergency)
- `doom-loop-detector.ts` — detects repeated identical tool calls, blocks or warns
- `tool-output-handler.ts` — summarizes large tool outputs, offloads to scratch files
- `project-context.ts` — injects CLAUDE.md and project type into agent prompts

### Memory (src/memory/)

- `hebbian/` — hebbian learning: strengthens associations between concepts based on co-activation
- `success/` — success pattern store: persists what worked across sessions
- `global/` — global memory manager
- `hybrid-retriever.ts` — combines vector search with hebbian associations
- Vector memory via embedded LanceDB

### Session Management (src/session/)

- `session-manager.ts` — create, resume, list, delete sessions
- `session.ts` — session state, message history, token tracking
- `session-recovery.ts` — crash recovery for interrupted sessions
- `session-store.ts` — persistence to disk
- `prompt-history-store.ts` — prompt history across sessions

### TUI Components (src/tui/)

- `components/` — messages (tree-structured), markdown renderer (with syntax highlighting, table rendering), editor, status bar, thinking indicator, tool call views
- `primitives/` — badge, separator, columns, selectable list, confirm prompt
- `core/` — terminal abstraction, differential renderer, ANSI utilities, input handling
- `themes/` — Catppuccin Mocha color palette
- `utils/` — ANSI-aware text wrapping, width calculation, truncation

### Superpowers Modules

- `src/think/` — multi-round deliberation for complex reasoning
- `src/clarity/` — goal clarity analysis (vague verbs, missing success criteria)
- `src/drift/` — detects conflicts between goal and task execution
- `src/journal/` — decision journal with supersession/contradiction checks
- `src/personality/` — agent personality injection (traits, communication styles)
- `src/briefing/` — session briefing from prior runs
- `src/handoff/` — generates CONTEXT.md handoff from final state

## Code Style

- TypeScript (ESM, built with tsup). Strict typing; no `any`, no `@ts-nocheck`.
- Brief comments for non-obvious logic only.
- Keep files under ~700 LOC; extract helpers over duplicating.
- Naming: **OpenPawl** in docs/headings; `openpawl` for CLI/package.

## Testing

- Bun test runner. Test files: `tests/*.test.ts` or colocated `src/**/*.test.ts`.
- Run `bun run test` before pushing when touching logic.

## Commits & PRs

- Concise action-oriented messages (e.g. `fix: correct event payload keys in sprint runner`).
- Group related changes; don't bundle unrelated refactors.
- **Auto-commit cadence:** Commit and push after each major logical unit of work (new feature, bug fix, refactor). Do NOT wait until the entire task is done — commit at natural milestones. Aim for commits in the ~200-1000 lines changed range. Avoid micro-commits for trivial edits (typos, single-line fixes) and avoid mega-commits with 2000+ lines.
- **Pre-commit safety checks:** Before every commit, run `git status` and `git diff --stat` to review what is staged. Check for accidentally included large files, build artifacts (`dist/`, `node_modules/`), secrets (`.env`, credentials), or binary blobs. If any staged file exceeds 500KB or any folder adds 50+ new files, stop and ask before committing.

## Git Workflow

### Branch strategy

```
main ← production, tagged releases only
  └── staging ← integration branch, sprint accumulator
        ├── feat/setup-wizard-tui ← feature branch (auto-created, auto-merged, auto-deleted)
        ├── fix/scroll-performance
        ├── feat/oauth-providers
        └── ...
```

### Branch lifecycle (FOLLOW THIS EVERY TIME)

**Before starting any task:**
1. `git checkout staging && git pull origin staging`
2. Create a topic branch: `git checkout -b <type>/<short-name>`
   - Types: `feat/`, `fix/`, `refactor/`, `chore/`, `docs/`
   - Example: `feat/dev-mode`, `fix/emoji-selection`, `refactor/message-renderer`
3. One branch = one theme. Multiple commits OK, but all related to the same topic.

**While working:**
4. Commit at natural milestones (~200-1000 lines changed)
5. Commit messages: `type: concise description` (e.g. `feat: add dev mode perf overlay`)

**When task is complete:**
6. Run full CI checks locally:
   ```bash
   bun run typecheck && bun run lint && bun run test
   ```
7. If ANY check fails → fix it on the same branch → re-run checks → repeat until all pass
8. Merge into staging:
   ```bash
   git checkout staging
   git merge --no-ff <branch-name>
   ```
9. Push staging: `git push origin staging`
10. Delete the topic branch:
    ```bash
    git branch -d <branch-name>
    git push origin --delete <branch-name> 2>/dev/null
    ```

**NEVER skip steps 6-7. NEVER merge with failing checks.**

### Staging → Main (sprint release)

When a sprint's worth of features/fixes are stable on staging:

1. Ensure staging CI is green
2. Merge staging into main:
   ```bash
   git checkout main
   git pull origin main
   git merge --no-ff staging
   ```
3. Run CI checks on main: `bun run typecheck && bun run lint && bun run test`
4. If CI fails → fix on a `fix/` branch off main → merge back to both main and staging
5. If CI passes → tag and release:
   ```bash
   # Determine version bump using semantic versioning:
   # - fix only → patch (0.0.x)
   # - new feature → minor (0.x.0)
   # - breaking change → major (x.0.0)

   git tag -a v<version> -m "Release v<version>: <summary>"
   git push origin main --tags
   ```
6. Create GitHub release from the tag with changelog

### Semantic versioning rules

- **patch** (0.0.1 → 0.0.2): bug fixes, perf improvements, typo fixes
- **minor** (0.1.0 → 0.2.0): new features, new commands, new providers, UI improvements
- **major** (0.0.x → 1.0.0): breaking config changes, CLI interface changes, v1.0.0 launch

Current version: 0.0.1 (pre-release). Most changes are minor until v1.0.0.

### Changelog generation

When tagging a release, generate changelog from commits since last tag:
```bash
git log v<prev>..HEAD --oneline --no-merges
```

Group by type (feat/fix/refactor/chore) in the release notes.

### Rules

- Never commit directly to main
- Never commit directly to staging (except merge commits)
- Never force push main or staging
- Always create a topic branch for every task
- Always delete topic branches after merge
- One theme per branch, no mixing unrelated changes
- If a branch lives > 5 days, rebase on staging to avoid conflicts

## Pre-commit Hook

Located at `.githooks/pre-commit`, installed via `make install-hooks` (sets `core.hooksPath`). Runs typecheck → lint → tests in sequence. All must pass or the commit is blocked.

## Git Notes

- Branch delete blocked? Use `git update-ref -d refs/heads/<branch>`.
- Bulk PR operations (>5): ask for explicit confirmation with count and scope.
- File references: repo-root relative only (e.g. `src/core/simulation.ts:49`).
- GitHub CLI: use `-F - <<'EOF'` for multiline bodies; never `\"\\n\"` or `-b "..."` with backticks/shell chars.
- GitHub linking: plain `#123` for auto-links (no backticks). Print full URL at end of issue/PR tasks.
- Verify answers in code; do not guess.

## Security

- Never commit real credentials/tokens. Use `.env` from `.env.example`.
- Dashboard server has no built-in auth. Bind to `127.0.0.1` or trusted network.

## Agent-Specific Notes

- Never edit `node_modules`.
- **Multi-agent safety:** no stash create/apply/drop unless requested. No branch switching unless requested. Scope commits to your changes only. On push, `git pull --rebase` to integrate. Focus reports on your edits.
- Formatting-only diffs: auto-resolve without asking. Only ask on semantic changes.
- Bug investigations: read source before concluding; aim for high-confidence root cause.
- No dependency patching or version bumps without explicit approval.

## Tech Stack

TypeScript (ESM), Bun, tsup, Zod, LanceDB, cli-highlight. Multi-provider LLM (Anthropic SDK, OpenAI-compatible, Bedrock, Vertex). No Python.
