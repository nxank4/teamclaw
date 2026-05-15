# Changelog

## [Unreleased]

## [0.4.0-rc.3] - 2026-05-15

Tier 1 polish + security release. Visible session continuity, crew mode token streaming for parity with solo, and structured phase-blocked reasons with both inline ⊘ rendering and phase-summary surfacing. Tagline unified across all surfaces. Two CodeQL security alerts closed.

### Added
- **Session resume banner** (#162). Bare `openpawl` and `openpawl -c` now show "Resuming session: <name> · <messages> · <relative time>" when a prior session is restored. Silence on fresh start. Closes the rc.1 Bug U+6 ("session continuity is invisible") and J2 ("auto-resume claims a fresh launch").
- **Crew subagent token streaming** (#163). Crew mode now streams agent tokens into the TUI tree in real time during planner, coder, reviewer, tester turns — matching solo-mode UX. Previously the TUI showed only tool-call spinners between phases, leaving long "thinking" gaps that felt frozen. `onToken` threaded from `dispatchCrew → runCrew → subagent-runner → runAgentTurn` via the existing `(agentId, token)` signature; TUI required no changes.
- **Structured phase-blocked reason** (#164). When a crew task blocks, the cause is captured as a typed field `blocked_reason: { code, message, details }` on the task. 13 stable block codes cover budget exhaustion (task/phase/session), dependency failure, capability denial, write-lock timeout, validator rejection, timeout, environment error, and retry exhaustion. The reason surfaces in three places: a live `⊘ <agent>: <task> blocked: <reason>` system line the moment the transition happens (via new `RouterEvent.AgentTaskBlocked`), a `↳ <message>` line under each blocked task in the phase-summary table with hanging-indent wrap, and a `blocked_reasons[]` array on `PhaseSummaryArtifact` for audit and replay. 11 production block sites refactored through a single `markTaskBlocked(task, reason, onTaskBlocked?)` helper. Closes the rc.1 Bug U+4.

### Changed
- **Tagline unified across all surfaces** (#161). Welcome banner now uses `PRODUCT_TAGLINE_SHORT` ("Plan. Build. Review. Remember. Repeat.") instead of the separate `PRODUCT_TAGLINE_HEADLINE` ("Crew AI for your terminal"). CLI banner, onboarding intro, npm package description, and welcome card all read the same brand line.
- **README install section** exposes both stable and prerelease channels — see Migration below.

### Security
- **2 CodeQL alerts resolved** (#158). Closed: input sanitization gap and a prototype-pollution vector. Both flagged in the GitHub Advanced Security scan; no known exploit in the wild. Recommend rc.2 users upgrade to rc.3.

### Removed
- **Stale `openpawl logs work` subcommand** (#160). Pointed at a dead log source after the v0.4 crew refactor retired the `work` CLI surface. `openpawl logs work` now exits 1 with "unknown subcommand".
- **`PRODUCT_TAGLINE_HEADLINE` constant** (#161). Subsumed by `PRODUCT_TAGLINE_SHORT`.
- **`task.error: string` and `task.error_kind: TaskErrorKind` fields on `CrewTaskSchema`** (#164). Replaced by the structured `blocked_reason` field.

### Dependencies
- `@clack/prompts` 0.9.1 → 1.4.0 (#151).
- `@types/node` 22.19.19 → 25.7.0 (#152).

### Internal
- TeamClaw prototype leftover files removed; author and copyright aligned to CodePawl (#159).
- Pre-publish package cleanup (files array, sourcemap exclusion, metadata) for the rc.2 release (#157).
- Package scoped to `@codepawl/openpawl`; stale install path references in README and docs aligned (#156). See Migration below.
- README, CLAUDE.md, and docs/CREW.md synced to the rc.2 surface (#155).

### Migration

Breaking (distribution only): npm package name changed from `openpawl` to `@codepawl/openpawl` in 0.4.0-rc.2 (#156). Versions 0.4.0-rc.3+ ship to the scoped name only. Existing users on the unscoped package must migrate:

```bash
npm uninstall -g openpawl
npm install -g @codepawl/openpawl@next
```

No code, config, CLI surface, or `~/.openpawl/` state changes — the binary name (`openpawl`), keychain service identifier, and on-disk layout are unchanged.

**Code-level migration from rc.2:**
- Downstream code reading `task.error` or `task.error_kind`: switch to `task.blocked_reason?.message` and `task.blocked_reason?.code` respectively. The full enum of block codes lives in `src/crew/types.ts`. The `env_error` subkinds previously in `error_kind` now live in `blocked_reason.details.kind`.
- Programmatic users of `PRODUCT_TAGLINE_HEADLINE`: switch to `PRODUCT_TAGLINE_SHORT`.
- `openpawl logs work` users: no migration; the subcommand had no successor surface.

### Known Issues (carried from rc.2)
- Bug U+11 — smaller models call tools on ambiguous prompts despite the system-prompt rule.
- Bug U+13 — agent may claim file does not exist before reading.
- Bug U+14 — agent may infer task content from prior context on rapid prompts.
- Crew preset selection from TUI deferred to Tier 2 (`/crew switch <name>` not yet wired).
- `/sessions` slash command not yet registered in TUI (CLI subcommand exists).
- 3 dependabot HIGH-risk PRs still open: #93 typescript 5→6, #130 successor for @types/node, #132 zod 3→4. Defer to v0.4.0 stable.

## [0.4.0-rc.2] - 2026-05-13

Polish + CLI mechanic consolidation release. The non-interactive surface collapses from `openpawl run --headless` into the `-p` print mode, mirroring Claude Code's mechanic. Crew mode gains a first-class `openpawl crew run <name> <goal>` entry point and a `--mode` global flag for direct TUI launch. README ground-truth sync. Deferred dependabot PRs from the rc.1 known-issues list landed.

### Added
- **`-p` print mode covers both solo and crew** (#138). `openpawl -p "<goal>"` runs solo non-interactively; `openpawl -p "<goal>" --mode crew [--crew <name>]` runs crew. Replaces the parallel `openpawl run --headless` path. Default crew preset is `full-stack`; pass `--crew <name>` to pick a user preset.
- **`openpawl crew run <name> <goal>`** (#139). Explicit subcommand for non-interactive crew runs with a named preset. Shares the same `runCrewHeadless` helper as `-p --mode crew`. Fails fast on unknown preset name.
- **`--mode <solo|crew>` global flag** (#140). Launches the bare-`openpawl` TUI directly in the requested mode. No persistence — flag affects current session only. Default stays solo. Shift+Tab still cycles modes mid-session.
- **Dependabot retarget** (#134). Future dep PRs now base on `staging` instead of `main`, matching the dev-branch workflow.

### Changed
- **README rewritten to ground truth** (#141). New "Mechanic at a glance" section near the top. Daily-usage covers interactive (Shift+Tab, /mode, slash commands), non-interactive (`-p`, `crew run`), and crew management. All references to deprecated paths (`openpawl work`, `run --headless`, `--mode sprint`, `--mode collab`) removed.
- **Vite stack bumped together** (#136). `vite 7 → 8` + `@vitejs/plugin-react 5 → 6` landed as a coordinated batch to avoid plugin-version mismatch.
- **Headless `runCrew` local stub unshadowed** (#137). The placeholder symbol in `src/app/headless.ts` no longer collides with the real exported `runCrew` from `src/crew/crew-runner.ts`. Pure cleanup, no behavior change.

### Removed
- **`openpawl run --headless` command** (#138). Folded into `-p` print mode. Migration: replace `openpawl run --headless --mode solo "<goal>"` with `openpawl -p "<goal>"`, and `openpawl run --headless --mode crew "<goal>"` with `openpawl -p "<goal>" --mode crew`.
- **Orphan `work` command** (#137). Was unreachable since the TeamClaw → OpenPawl rename; help text and `dev:work` npm script removed.
- **`--mode sprint` deprecation alias** (#137). Removed alongside the `--mode collab` migration error. Both modes had been retired in rc.1.
- **Stale `run --headless` references in user-facing output** (#142). `src/handoff/resume-generator.ts` and `src/commands/logs-debug.ts` now print the `-p` equivalent.

### Migration from rc.1
- `openpawl run --headless --mode solo "<goal>"` → `openpawl -p "<goal>"`
- `openpawl run --headless --mode crew "<goal>"` → `openpawl -p "<goal>" --mode crew`
- `openpawl run --headless --mode crew --crew <name> "<goal>"` → `openpawl crew run <name> "<goal>"` or `openpawl -p "<goal>" --mode crew --crew <name>`
- Programmatic users who imported `runHeadless` from `src/app/headless.ts` should use `runSoloHeadless` / `runCrewHeadless` from `src/app/run-solo-headless.ts` / `src/app/run-crew-headless.ts`.

### Known Issues (carried from rc.1)
- Bug U+4 — phase-blocked task does not surface actionable reason in chat.
- Bug U+6 — session continuity invisible on TUI launch.
- Bug U+11 — smaller models call tools on ambiguous prompts despite system-prompt rule.
- Bug U+13 — agent may claim file does not exist before reading.
- Bug U+14 — agent may infer task content from prior context on rapid prompts.
- 3 remaining dependabot HIGH-risk PRs (#93 typescript 5→6, #130 @types/node 22→25, #132 zod 3→4) deferred to rc.3.

## [0.4.0-rc.1] - 2026-05-09

Crew mode end-to-end. Phase 1 of the v0.4 design spec lands in this release: planner → tier-gated phase executor → discussion meeting → drift supervisor → context compaction → Hebbian injection. UX polish across solo and crew, observability into subagent tool calls, and the bundled built-in preset story (no more on-disk auto-copy).

### Added
- **Crew runtime** end-to-end: planner with complexity-tier classification (#110), phase execution with parallelism + token budgets (#111), discussion meeting with sycophancy guards + facilitator synthesis (#112), drift supervisor + context compaction + Hebbian injection (#113).
- **Three-layer checkpoint UI**: Plan / Review / Drift gates with `/pause`, `/continue`, `/skip`, `/reorder`, `/abort`, `/adjust` slash commands and a re-anchor binding (#114).
- **Crew runtime integration**: tool execution wiring + CrewSession host + manifest sentinel + bundled-preset auto-copy on first run (#115). Auto-copy was later replaced — see *Changed*.
- **Tier 1 observability**: subagent progress events (every tool call lifecycle) are forwarded onto `RouterEvent.AgentTool` so the TUI's existing tree renderer paints crew runs the same way it paints solo runs. Structured JSONL debug logs land in `~/.openpawl/logs/<session>.jsonl` (#118).
- **Solo agent ambiguity-clarify**: short / single-word prompts now trigger one short clarifying question instead of a guess (#121).
- **Welcome banner refresh**: minimal banner with an example prompt; version pulls from `package.json` (#122).
- **`openpawl crew` CLI**: `list / show / create / edit / delete / validate / clone` subcommands. Built-ins are protected from deletion; `clone` rewrites the manifest's `name` field so the fork loads under its new id (this PR).
- **Crew docs**: [docs/CREW.md](./docs/CREW.md) — full guide covering architecture, manifest format, write_scopes, capability gate, three-layer checkpoints, discussion meeting, slash commands, CLI commands, known limitations (this PR).

### Changed
- **Spinner frames**: the unified ThinkingIndicator + tree-node spinner moved from the box-outline set `❏ ❐ ❑ ❒` to the corner-rotation set `▖ ▘ ▝ ▗`. The new cycle wraps to the adjacent corner so the loop reads as a continuous chase (#124). Cadence stays at 200 ms; the 16-word P-themed flavour pool is unchanged.
- **Spinner consolidation**: ThinkingIndicator and the inline tree-node spinner now read from a single canonical 4-frame set at 200 ms, so two visible spinners never drift out of phase (#120).
- **Built-in preset resolution**: presets are read in place from the bundled location, never copied into `~/.openpawl/crews/` on first run (#117). Eliminates the auto-seed-on-first-run failure mode from Bug Z. User overrides at `~/.openpawl/crews/<name>/manifest.yaml` continue to take precedence.
- **Sprint and collab execution modes** retired (in favour of crew). Removed `dispatchCollab()` path, `@collab` mention parser, `SprintEvent` enum, and dead `wireDebugToSprintRunner()` listeners (#99). 22 stale debug post-mortems + screenshots removed alongside.
- `--mode` CLI flag now only accepts `solo` (was `solo | collab | sprint`).
- TUI mode cycle (`Shift+Tab`) is `solo ↔ crew`.
- `scripts/testing/benchmark.ts` and `scripts/testing/stress-test.ts` reduced to solo-only.

### Fixed
- **Bug U** — TUI freeze after a successful crew run. `dispatchCrew` now emits the `Done` event the TUI's `onDispatchDone` handler expects (#116).
- **Bug Z** — built-in preset manifest reported "not found" on a fresh install because tsup's `clean: true` left an empty `dist/presets/` and the subsequent `cp` nested everything one level deeper. Replaced auto-copy with bundled-resolution (#117).
- **Bug U+1** — `OPENPAWL_DEBUG=true` collided with TUI rendering. Debug logs now write to `~/.openpawl/logs/<session>.jsonl` only; nothing prints to the TUI surface (#118).
- **Bug U+2** — ThinkingIndicator placeholder stayed frozen on screen after a successful crew run because the crew path never emitted `AgentToken` (subagents are isolated). `onAgentDone` now strips any lingering thinking-tagged message (#118).
- **Bug U+3** — progress tree disappeared when a phase auto-advanced because `clearToolCalls` ran on every `AgentStart`. Tree rebuilds preserve completed nodes across phase boundaries (#119).
- **Solo tree-node state**: `pending approval` is now visually distinct from `executing`, so the user can tell whether the spinner is waiting on Y/N or on the tool itself (#120).
- **Multi-line tool input wrapping**: every wrapped subline is prefixed with the tree branch char so wrapped lines stay indented under the node instead of falling flush-left (#120).
- **Bug U+8** — solo agent treated every prompt as if there was prior context that wasn't there. Two root causes: the input handler appended the current user prompt to the chat session before `route()` ran (so the router saw it twice), and `resumeLatest()` picked the globally most-recent session regardless of workspace (so a session for project A auto-resumed in project B). The router now strips the trailing in-flight user turn from `priorMessages`, and `resumeLatest(workspacePath)` filters by workspace (#123).
- **Bug U+9** — typing during dispatch caused parallel prompt processing because the queue drain fired from `AgentDone` (mid-await) instead of after the dispatch tear-down had finished. Drain moved to the input handler's `finally` (#125).
- **Bug U+10** — duplicate `Assistant:` header on a single agent turn when a tool-approval system message landed between two streamed chunks. New `MessagesComponent.appendToLastAgent` walks back to the most recent agent entry; streaming only opens a new agent message when the dispatch genuinely switches agents (#125).
- **Bug U+16** — queued prompts looked dropped: the busy-path stamped a `pending: true` user message that rendered too dim to read. Queued prompts now render with the same accent + colour as non-queued prompts the moment the user presses Enter (#126).

### Removed
- **`ensureBuiltInPresets` disk-copy mechanism** (#117) — replaced with bundled-resolution + user-override.
- Three unreferenced helper scripts and one broken sprint-only bench (`run-context-fix-bench.sh`).

### Known Issues (rc.1)
- **Bug U+4** — phase-blocked task does not surface an actionable reason in the chat (the reason is in the debug log).
- **Bug U+6** — session continuity is invisible: the TUI does not show a "resuming session X" signal on launch even though the session is correctly resumed.
- **Bug U+11** — smaller models (e.g. minimax-m2.7) sometimes still call tools on ambiguous prompts despite the system-prompt rule. Larger models follow it reliably.
- **Bug U+13** — agent may claim a file does not exist before reading it.
- **Bug U+14** — agent may infer task content from prior context when prompts arrive in rapid succession (medium-model behaviour).
- 9 dependabot PRs deferred for batch review post-rc.1.

## [0.3.0] - 2026-04-18

Sprint correctness and context-sharing release. Closes out a two-day debug session that moved the CLI Task Manager benchmark sprint/solo output-token ratio from **2.08× (pre-PR-74)** to **0.66× (post-PR-84)** — a **68 % reduction**. Sprint is now meaningfully cheaper than solo on the reference benchmark, with honest claim-vs-disk quality.

### Fixed
- **Retry semantics rework** (#77): classifier-backed `isRetriable` skips `env_*` and `timeout` kinds because the same agent in the same environment cannot recover. Eliminated the false-positive retry cascade that previously re-ran tasks blocked by missing deps.
- **Env error classification** (#77): tasks that fail with `exit 127` / command-not-found / missing-dep surface `BLOCKED: <what is missing>` instead of looping through retries. `classifyError`/`classifyTask` prefer exit code over regex.
- **Validator correctness** — two bugs fixed:
  - **Parallel-attribution race** (#78): tool calls now attribute by explicit `taskIndex` threaded through `runAgent` → `handleTool` → `recordToolCall`, replacing the shared `state.currentTaskIndex` that got clobbered under concurrent execution.
  - **Leniency tightened** (#82): `shell_exec` no longer counts as write evidence. Write-intent tasks that only ran reads/shells are now correctly flagged incomplete. Eliminates silent success on tasks that produced no files.
- **Planner misassignment** (#83): LLM planner no longer self-assigns write-intent tasks. Prompt constraint + runtime `downgradePlannerOnWrite` guard reassigns to `coder`. Planner output tokens dropped from 52,445 (85.5 % of run) to 943 (8 %) on the CLI Task Manager benchmark.

### Added
- **Inter-task context sharing** (#84): `TASK_PROMPT` now includes a compact "Files already created" digest listing on-disk files produced by prior completed tasks, each with a ≤100-char hint. Bounded at 500 chars with `…+N more` tail. Eliminates coder cold-start: `src/types.ts` re-reads dropped from 18 to 4 across a 5-task plan.

### Benchmark impact (CLI Task Manager sprint)
| metric | pre-session baseline | post-PR-84 | Δ |
|---|---|---|---|
| output tokens | 22,414 | 10,976 | −51 % |
| sprint/solo output ratio | 2.08× → 0.89× (post-PR-83 partial) | **0.66×** | target <1.2× ✅ |
| `task-1` turns (scaffold) | 20 | 10 | −50 % |
| `src/types.ts` re-reads | 18 | 4 | −78 % |
| retry count pathology | 5 false-positives | 0 | eliminated |

Full trace in `docs/debug/pr83-investigation.md`.

## [0.2.0] - 2026-04-17

Sprint retry-semantics overhaul. Four-PR chain eliminates the env-retry cascade and the parallel-task validator race, delivering a measured **−69 % sprint output tokens** and **−56 % wall time** on the CLI Task Manager benchmark (`docs/debug/pr78-validation.md`). Sprint/solo output-token ratio on the same benchmark: **2.08× → 0.63×** — sprint is now cheaper than solo.

### Fixed
- **Validator parallel-attribution race** (#78): `recordToolCall` previously used a shared `state.currentTaskIndex` that got clobbered by concurrent `executeTask` frames. Tool calls now attribute by explicit `taskIndex` threaded through `runAgent` → `handleTool` → `recordToolCall`. Eliminates false-positive "incomplete" retries under parallel execution.
- **Retry routing preserves original agent** (#69): retries no longer reroute to `debugger` via keyword match on the error message. Attribution now correctly reflects which agent did the work.

### Added
- **Structured `shell_exec` result** (#76): `executeShell` returns `{ exitCode, stdout, stderr }` (previously merged). `ToolOutput.data` carries all three fields typed as `ShellExecData`. `executeTool` callback return type extended with optional `success`, `exitCode`, `stderrHead`. `SprintTask` gains `toolCallResults: SprintToolCallResult[]` alongside existing `toolsCalled`.
- **Error classifier** (#77): new `src/sprint/error-classify.ts` with `ErrorKind` union (`env_command_not_found | env_missing_dep | env_perm | env_port_in_use | timeout | agent_logic | unknown`), `classifyError` (prefers exit code over regex), and `classifyTask` (reads `toolCallResults`). `FAILURE_RULES` moved from `post-mortem.ts` — no regex duplication.
- **Classifier-backed retry gating** (#77): `SprintRunner.isRetriable` consults the classifier first. `env_*` and `timeout` kinds skip retry because the same agent in the same environment cannot recover. Emits `sprint:retry_gate` debug event with `{ taskId, kind, signal, willRetry }`.
- **Agent escalation clause** (#77): coder, tester, debugger, and assistant system prompts now instruct the LLM to stop and emit `BLOCKED: <what is missing>` on `exit 127` / "command not found". Reviewer, planner, and researcher prompts unchanged.
- **Retry root-cause analysis** (#75): new `docs/debug/retry-root-cause-analysis.md` diagnosing the two nested retry loops (model-level LLM turn loop and sprint-level task re-execution) with ranked structural fixes.

### Fixed (bug fixes from the chain)
- `llm-agent-runner.ts` now records `success: false` when a tool returns exit-non-zero, not just when the executor throws. Previously logged `success: true` on `exit 127`.
- `SprintTask.toolCallResults` is reset to `[]` on task retry (previously only `toolsCalled` was reset).
- Thrown-task errors are now enriched with the last shell exit code (`"... (last shell exit ${N})"`) via new `SprintRunner.lastShellFailure` helper.

## [0.1.0] - 2026-04-14

First public release. Major rewrite from v0.0.1: replaced LangGraph pipeline with native API tool calling, added TUI-first interactive mode, removed dead code (11k LOC), and added 15 new features.

### Added
- 3 execution modes: solo, collab, sprint (replaces single LangGraph pipeline)
- Interactive TUI with Catppuccin Mocha theme, mouse support, keyboard navigation
- `/agents` CRUD — create, edit, delete custom agents from TUI
- `/team` view — browse and switch team templates interactively
- `/mode` — switch between solo, collab, sprint with Shift+Tab
- Inline colored diffs on file writes/edits (TUI and headless)
- Escape to cancel any streaming response
- Headless mode: `openpawl run --headless --goal "..." --mode --template --runs --workdir`
- Context compression — automatic compaction keeps context growth < 1x
- Token counter in status bar (live input/output tracking)
- Type-to-filter in all list views (agents, templates, sessions)
- Centralized keybindings with `/hotkeys`
- Post-mortem learning — extracts lessons across runs, injects into future planning
- Hebbian memory — strengthens concept associations based on co-activation
- Autonomous team composition based on goal analysis
- Performance profiler (opt-in timing breakdown)
- Min terminal size handling with graceful degradation
- Provider/model sync as single source of truth

### Changed
- LLM engine: native API tool calling with multi-turn streaming (replaces LangGraph)
- Architecture: prompt router → agent runner → LLM multi-turn loop
- Test runner: Bun test (was Vitest)
- Sprint mode: keyword-based agent assignment (was coordinator-based)

### Removed
- LangGraph dependency and 12-node pipeline
- Standalone dashboard server (Fastify + SSE)
- 153 dead code files (11k LOC): plugins, MCP server, streaming, old setup wizard
- Instructor.js structured output layer
- Langfuse telemetry integration

## [0.0.1] - 2026-03-18

### Added
- Multi-provider LLM support: Anthropic, OpenAI, OpenRouter, Ollama, DeepSeek, Groq
- Provider fallback chain with automatic failover
- Setup wizard with provider configuration
- Template marketplace: browse, install, publish
- 5 seed templates: content-creator, indie-hacker, research-intelligence, business-ops, full-stack-sprint
- 12-node LangGraph orchestration pipeline with parallel worker execution
- Vector memory via embedded LanceDB
- Decision journal, drift detection, standup, replay, heatmap, forecast
- Rubber duck mode, vibe coding score, cost forecasting
- Real-time WebSocket dashboard
