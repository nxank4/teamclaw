# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenPawl is a TypeScript-native coding-agent workspace. Every prompt
runs through a single execution path: the orchestrator dispatcher picks
one or more specialists from a markdown agent registry, spawns them via
the subagent runner, and pipes their results back through the
chat-stream. Memory persists across sessions via LanceDB; a decision
journal, drift detection, post-mortem learning, and session briefing
keep context alive between runs.

## Namespace note

- `docs/`               — project architecture, audits, skill triggers (canonical).
- `.claude/`            — reserved for Claude Code's own files. **Do not put OpenPawl product content here.**
- `~/.openpawl/`        — global config + memory (source of truth).
- `./.openpawl/`        — project-local state (per-workspace overrides).
- `./agents/`           — project-local markdown agents.
- `~/.openpawl/agents/` — user-installed markdown agents.

## Commands

Runtime: Node ≥ 20, Bun.

- `bun install` — install deps (workspace: root, `src/web/client`, `packages/*`)
- `bun run build` — `tsup` + web client build (copies `src/agents/builtin/*.md` to `dist/agents/builtin/`)
- `bun run typecheck` — `tsc --noEmit`
- `bun run lint` — `eslint src/`
- `bun run test` — Bun test runner
- `bun run test:e2e` — `tests/e2e/` only
- `bun run test:watch` / `bun run test:coverage`
- `bun run dev` — tsup watch mode
- `bun run dev:cli` / `dev:web` — tsx-driven entry points
- `bun run web` — production web dashboard build + serve
- `bun run benchmark` — `scripts/testing/benchmark.ts`

Out-of-band test scripts (live in `scripts/testing/`, not `src/testing/`):
- `bun run tsx scripts/testing/prompt-quality-test.ts`
- `bun run tsx scripts/testing/session-test.ts`
- `bun run tsx scripts/testing/stress-test.ts`
- `bun run tsx scripts/testing/provider-test.ts`

Headless / non-interactive entry: `openpawl -p "<prompt>"`.
Special case: `openpawl -p "/status"` runs a provider health check (no LLM call).
Bare `openpawl` (no args) launches the interactive TUI.

Debug:
- `OPENPAWL_DEBUG=true openpawl ...` — structured JSONL logs.
- `openpawl logs debug --timeline` — view debug logs.
- `OPENPAWL_PROFILE=true openpawl ...` — performance profiling.
- `OPENPAWL_DEBUG_STARTUP=1` — print stage timings to stderr from `cli.ts`.

## CLI Surface

Top-level commands (see `src/cli/command-registry.ts` for the source of truth):

`setup`/`init`, `check`, `demo`, `chat`, `standup`, `think`,
`clarity`, `journal`, `drift`, `lessons`, `handoff`,
`model`, `providers`, `agent`, `settings`, `config`, `replay`, `audit`,
`heatmap`, `forecast`, `diff`, `score`, `sessions`, `memory`, `cache`,
`logs`, `profile`, `clean`, `update`, `uninstall`.

Primary interactive entry point is bare `openpawl` (no args). `openpawl -c` / `--continue` also launches the TUI (user resumes via `/sessions`).

## Architecture

Single execution path — there is no mode switching. Every prompt:

```
TUI editor (or `openpawl -p` headless)
    │
    ▼
src/app/input-handler.ts          ─── parses /commands, @mentions, !shell
    │
    ▼
src/app/prompt-handler.ts         ─── autoCompactIfNeeded at ≥70%
    │
    ▼
src/router/prompt-router.ts:route ─── slash commands, mention parsing,
    │                                  intent classification, dispatch
    ▼
src/orchestrator/dispatcher.ts    ─── registry.all() → similarityTopK
    │                                  (embedder + Jaccard fallback) →
    │                                  spawn matched subagents
    ▼
src/orchestrator/subagent-runner.ts ─ depth gate, capability gate,
    │                                  write-lock, token budget
    ▼
src/router/agent-turn.ts          ─── LLM call loop with tool execution
    │
    ▼
result.summary → AgentResult → DispatchResult → chat stream
```

See `docs/architecture.md` for the full component map.

### Entry Points
- `src/cli.ts` — CLI bootstrap, proxy auto-detection, command dispatch
- `src/cli/command-registry.ts` — single registry of all CLI commands
- `src/app/index.ts` — TUI app orchestrator + `runPrintMode` (handles `-p` headless)
- `src/app/run-headless.ts` — non-interactive entry; wires the orchestrator dispatcher directly

### App sub-modules (`src/app/`)
`init-session-router.ts`, `router-wiring.ts`, `input-handler.ts`,
`config-wiring.ts`, `keybindings-setup.ts`, `session-helpers.ts`,
`prompt-handler.ts` (auto-trigger `/compact` at ≥70% context),
`tool-permission.ts`, `welcome.ts`, `tui-callbacks.ts`,
`agent-display.ts`, `startup.ts`, `layout.ts`, `autocomplete.ts`,
`file-ref.ts`, `shell.ts`, `config-check.ts`.

### Router (`src/router/`)
`prompt-router.ts`, `dispatch-strategy.ts`,
`llm-agent-runner.ts` (multi-turn tool-use loop),
`agent-config.ts`/`agent-registry.ts`/`agent-resolver.ts`,
`intent-classifier.ts`, `mention-parser.ts`,
`event-types.ts` (typed `RouterEvent` / `ToolEvent` enums — never use string literals).

### Orchestrator (`src/orchestrator/`)
- `dispatcher.ts` — task → registry similarity match → spawn subagents in parallel.
- `subagent-runner.ts` — `runSubagent`, depth limit, capability-gate + write-lock invariants.
- `compaction.ts` — `checkAndCompact` (in-memory only, no artifact persistence).
- `capability-gate.ts`, `write-lock.ts` — infrastructure for the runner.
- `types.ts` — `AgentDefinition`, `WRITE_TOOLS`.

### Agent Registry (`src/agents/`)

Agents are markdown files loaded from three locations with later-wins precedence:

1. `./agents/*.md`               — project-local
2. `~/.openpawl/agents/*.md`     — user-installed
3. `src/agents/builtin/*.md`     — ships with the binary (copied to `dist/agents/builtin/` by `tsup.config.ts`)

Frontmatter schema (zod-validated at load time):

```yaml
---
name: kebab-case-id              # required
description: one-line summary    # required, ≥ 20 chars, used by dispatcher
model: claude-opus-4-7           # optional
tools:                            # optional
  allow: [Read, Edit, Bash]
  deny:  [Write]
triggers:                         # optional; raises keyword-fallback score
  - plan
  - "how should"
---

You are the X. ...               # markdown body = system prompt
```

Loader: `src/agents/registry/markdown-loader.ts`.
Registry assembly: `src/agents/registry/markdown-registry.ts`.

Five built-in roles: `architect`, `builder`, `reviewer`, `tester`, `drift-supervisor`.

### Engine (`src/engine/`)
`llm.ts` — LLM call loop with context compression and parallel tool execution.

### Memory (`src/memory/`)
- `global/store.ts` — `GlobalMemoryManager` (LanceDB)
- `hybrid-retriever.ts` — vector search + reranking
- `hebbian/` + `hebbian-integration.ts` — associative learning
- `success/` — success-pattern storage
- `embeddings/similarity.ts` — cosine top-K with Jaccard keyword fallback; sha256-cached agent embeddings at `~/.openpawl/agents/embeddings-cache.json`.

### TUI (`src/tui/`)
`core/tui.ts` (engine), `components/`, `constants/icons.ts`,
`keybindings/input-shortcuts.ts`, `themes/`, `primitives/`,
`slash/`, `text/`, `autocomplete/`, `keyboard/`, `layout/`.
Notable component: `components/compact-summary.ts` — renderer for the
op:compact branded chat-stream message; Ctrl+O / Ctrl+E expand it.

### Flagship features (top-level dirs)
- `journal/` — decision journal (`extractor`, `store`, `supersession`)
- `drift/` — goal vs decision conflict detection
- `briefing/` — "previously on..." session briefing
- `handoff/` — `CONTEXT.md` auto-generation + resume
- `think/` — multi-perspective debate (rubber duck)
- `standup/` — daily standup generation
- `audit/` — run auditing + renderers
- `clarity/` — goal clarity analyzer + rewriter
- `forecast/` — cost/run forecast with learning discount
- `heatmap/` — agent performance visualization
- `score/` — vibe coding collaboration score
- `replay/` — session recording + diff/replay
- `research/` — research agent + change-agent
- `recovery/` — crash handler + error presenter
- `personality/` — agent personality injection
- `clarification/` (`conversation/`) — clarification dialogs + undo
- `onboard/` — first-run setup flow
- `agents/profiles/` — agent profile store
- `debate/`, `forecast/methods`, `graph/preview` — newer subsystems

### Other infrastructure
- `cache/` — response cache + interceptor
- `proxy/` — `ProxyService`
- `security/` — prompt injection detector
- `telemetry/`, `token-opt/`, `meta/`, `dev/`, `webhook/`
- `context/` — `compaction.ts`, `context-tracker.ts` (the `/compact` deps land here)
- `web/` — dashboard server + `client/` (separate workspace)
- `tools/` — tool executor, registry, permissions, `built-in/`
- `providers/`, `credentials/`, `session/`, `core/` (config, logger, errors, sandbox)
- `debug/logger.ts` + `debug/wiring.ts` — structured JSONL logging
- `utils/diff.ts` (LCS), `utils/safe-json-parse.ts` (6-layer JSON recovery), `utils/formatters.ts`

## Code Style

- TypeScript ESM, strict typing, no `any`.
- Files under 700 LOC.
- Use theme colors from `src/tui/themes/` (not hardcoded `ctp.*` or hex).
- Use `ICONS` from `src/tui/constants/icons.ts`.
- Use formatters from `src/utils/formatters.ts`.
- Use `safeJsonParse` for any LLM output parsing.
- Use `event-types.ts` enums for all router/tool events (no string literals).
- Debug logging: `debugLog(level, source, event, data)`. The `source`
  union in `src/debug/logger.ts` includes `orchestrator` for the new dispatcher path.

## Testing

- `bun test` runs the suite.
- Test before pushing when touching logic.
- `OPENPAWL_DEBUG=true` for trace logs, `OPENPAWL_PROFILE=true` for profiling.

## Git Workflow

### Branch strategy

```
main ← production, tagged releases only
  └── staging ← integration branch
        └── feat|fix|refactor|chore|docs/<short-name> ← topic branches
```

### Branch lifecycle (FOLLOW EVERY TIME)

Before starting:
1. `git checkout staging && git pull origin staging`
2. `git checkout -b <type>/<short-name>` (types: `feat/`, `fix/`, `refactor/`, `chore/`, `docs/`)
3. One branch = one theme.

While working:
4. Commit at natural milestones (~200–1000 lines).
5. Conventional commits: `type(scope): description`, imperative, lowercase, no period, no AI attribution.

When complete:
6. `bun run typecheck && bun run lint && bun run test` — all must pass.
7. Fix on the same branch if anything fails.
8. `git checkout staging && git merge --no-ff <branch>` then `git push origin staging`.
9. Delete the topic branch.

**Never skip steps 6–7. Never merge with failing checks. Never commit directly to `main` or `staging`. Never force-push shared branches.**

### Versioning
- patch: bug fixes, perf
- minor: new features, commands, UI
- major: breaking changes

### Pre-commit hook
`.githooks/pre-commit` runs typecheck → lint → tests. Install with `git config core.hooksPath .githooks` (no Makefile in repo).

### Git utilities
- Branch delete blocked? `git update-ref -d refs/heads/<branch>`
- Bulk PR operations (>5): ask for explicit confirmation
- File references: repo-root relative
- Multiline `gh` bodies: `-F - <<'EOF'`

## Security

- Never commit real credentials/tokens; copy `.env.example` → `.env`.
- Dashboard server has no built-in auth — bind to `127.0.0.1` or trusted networks only.

## Agent-Specific Notes

- Never edit `node_modules`.
- Multi-agent safety: no stash, no branch switching unless requested; scope commits to your changes only.
- Bug investigations: read source before concluding; aim for high-confidence root cause.
- No dependency patching or version bumps without explicit approval.

## Tech Stack

TypeScript (ESM), Bun, tsup, Zod, LanceDB, cli-highlight. Multi-provider LLM (Anthropic SDK, OpenAI-compatible, Bedrock, Vertex). Workspace pulls in `packages/sdk` and `src/web/client`. No Python.
