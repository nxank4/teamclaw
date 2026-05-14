<p align="center">
  <img src="./assets/logo.svg" width="120" alt="OpenPawl" />
</p>

# OpenPawl

**Terminal AI coding with a team of agents, not just one. Chat-based, keyboard-first, open source.**

[![CI](https://github.com/codepawl/openpawl/actions/workflows/ci.yml/badge.svg)](https://github.com/codepawl/openpawl/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js >= 20](https://img.shields.io/badge/Node.js-%3E%3D%2020-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/tests-885_passing-brightgreen)](#)
[![LOC](https://img.shields.io/badge/source-559_files%20·%2090.9k_LOC-informational)](#)

OpenPawl orchestrates a team of specialized AI agents toward your goals — with memory, learning, and structure that persists across sessions.

## The Problem

Vibe coding alone is a grind. Every session starts from scratch:

```
Before OpenPawl:                    After OpenPawl:
───────────────────────────────     ──────────────────────────────
Prompt into the void            →   Persistent team memory
Re-explain context every time   →   Instant session briefing
Make decisions alone            →   Structured debate + review
Forget why you chose X          →   Decision journal
Repeat the same mistakes        →   Global lessons learned
Ship things you're unsure of    →   Confidence-gated delivery
No structure                    →   Sprint cadence with standup
```

OpenPawl replaces that friction with a team that remembers, learns, and holds itself accountable.

## Mechanic at a glance

OpenPawl is TUI-first. Run `openpawl` to launch the interactive shell — solo mode by default (one agent answers your prompt). Press `Shift+Tab` or type `/mode crew` to switch to crew mode, where a planner decomposes the goal and a team of agents executes it under a phase loop with discussion meetings, drift supervision, and live checkpoint controls.

For non-interactive runs, `openpawl -p "<prompt>"` does what `claude -p` does: print the response and exit. Add `--mode crew` to run the full crew pipeline without the TUI; pair it with `--crew <name>` to select a preset. `openpawl crew run <name> <goal>` is the ergonomic alias for the same crew operation. Launch the TUI directly in either mode with `openpawl --mode <solo|crew>` — useful when crew is your default.

## Screenshots

### Welcome

<img src="./docs/screenshots/welcome.png" width="800" alt="OpenPawl Welcome Screen" />

*Interactive TUI with slash commands, agent mentions, and status bar.*

### Model & Provider Selection

<img src="./docs/screenshots/model.png" width="800" alt="Model Selection" />

*Switch providers and models on the fly. 15+ providers supported.*

### Team Templates

<img src="./docs/screenshots/team.png" width="800" alt="Team Templates" />

*5 built-in team templates. Pick a team or let OpenPawl compose autonomously.*

### Crew Mode

A team of agents — planner, coder, reviewer, tester — works together on the goal. Tier-1 observability streams every subagent's tool calls into the TUI tree so you can watch the run, not just wait on it. See **Crew Mode** below or [docs/CREW.md](./docs/CREW.md) for the full guide.

### Escape to Cancel

<img src="./docs/screenshots/cancel.png" width="800" alt="Cancel Streaming" />

*Press Escape to stop any response mid-stream. Partial output preserved.*

## Install

```bash
npm install -g @codepawl/openpawl
# or: bun add -g @codepawl/openpawl
```

Or the standalone installer (writes to `~/.openpawl`):

```bash
curl -fsSL https://raw.githubusercontent.com/codepawl/openpawl/main/install.sh | sh
```

**Requirements:** Node.js >= 20, bun, and an LLM API key (Anthropic, OpenAI, OpenRouter, DeepSeek, Groq, or local Ollama).

## Quickstart

```bash
openpawl setup                              # guided setup wizard
openpawl                                    # interactive TUI (solo)
openpawl --mode crew                        # interactive TUI (crew)
openpawl -p "Build auth"                    # non-interactive solo
openpawl -p "Build auth" --mode crew        # non-interactive crew (full-stack preset)
openpawl crew run full-stack "Build auth"   # crew run, explicit preset
openpawl -c                                 # resume the most recent session
openpawl standup                            # daily summary
openpawl think "SSE or WebSocket?"          # rubber duck mode
```

Bare `openpawl` launches the interactive TUI in solo mode. `-p` is the single non-interactive entry; pass `--mode crew` (with optional `--crew <name>`) for crew runs. `openpawl crew run <name> <goal>` is the same crew operation expressed as a positional command.

## Features

### Execution Modes

| Mode | How it works | Status |
|------|-------------|--------|
| **Solo** | Single agent responds to prompts with tool calling | ✅ Working |
| **Crew** | Multi-agent: planner decomposes → tier-gated phases → discussion meeting → drift supervisor | ✅ Working (rc.2) |

Cycle modes with `Shift+Tab` (or `/mode <solo|crew>`) in the TUI. Launch directly in a mode with `openpawl --mode <solo|crew>`. Both modes run end-to-end interactively *and* non-interactively (`-p "<prompt>" --mode <solo|crew>`).

### Team Orchestration

7 built-in agents (coder, reviewer, planner, tester, debugger, researcher, assistant) are defined and ready to be exercised by crew mode. Agents use keyword-based routing and confidence-gated delivery.

Team composition is flexible: pick agents manually, let the system compose autonomously based on your goal, or use one of 5 built-in templates. Custom agents can be created and configured via `/agents` in the TUI. Agent profiles track performance across runs.

### Memory and Learning

The team remembers across sessions. Success patterns get stored in LanceDB — future runs retrieve what worked. Failures feed a post-mortem loop so mistakes don't repeat. Every architectural decision is logged in a searchable decision journal. Hebbian memory strengthens associations between concepts based on co-activation.

### Developer Tools

- **Session briefing** — "previously on OpenPawl" context every time you start
- **Daily standup** — what was done, what's blocked, what's next
- **Rubber duck mode** — structured debate from multiple perspectives
- **Drift detection** — flags when a new goal contradicts past decisions
- **Goal clarity checker** — challenges vague goals before planning begins
- **Context handoff** — auto-generates CONTEXT.md at session end
- **Inline diffs** — colored unified diffs on file writes/edits in both the TUI and print mode
- **Post-mortem learning** — extracts lessons across runs, injects into future planning

### Terminal UI

- **Rich TUI** — keyboard navigation, Catppuccin Mocha theme, mouse support
- **Escape to cancel** — stop any streaming response mid-flight
- **Token counter** — live input/output token tracking in the status bar
- **Type-to-filter** — filter in all list views (agents, templates, sessions)
- **Centralized keybindings** — view and customize via `/hotkeys`
- **Min terminal size handling** — graceful degradation on small terminals
- **Context compression** — automatic compaction keeps context growth < 1x

### Observability and Control

- **Audit trail** — full decision log exported as markdown
- **Replay mode** — re-run any past session for debugging
- **Agent heatmap** — find utilization bottlenecks across runs
- **Cost forecasting** — estimate cost before a run starts
- **Performance profiler** — opt-in timing breakdown of the full pipeline
- **Non-interactive mode** — `openpawl -p "<prompt>"` runs solo or crew (`--mode crew --crew <name>`) without the TUI; `openpawl crew run <name> <goal>` is the ergonomic shortcut
- **Provider/model sync** — single source of truth across agents and modes

## Crew Mode

Crew mode runs a team of agents on a single goal: a planner decomposes the task, agents execute phase tiers in parallel where the dependency graph allows, a discussion meeting fires before tier 3 to surface disagreement, and a drift supervisor halts the run when later phases contradict earlier decisions.

**Enter crew mode** — launch `openpawl --mode crew` to start directly in crew, or run bare `openpawl` and press `Shift+Tab` (or type `/mode crew`) to switch. The status bar shows the active mode.

**Built-in preset** — `full-stack` ships with four agents: Planner, Coder, Reviewer, Tester. Each has its own write_scope and tool capabilities. Run `openpawl crew show full-stack` to inspect.

**Custom crews** — fork a built-in and edit:

```bash
openpawl crew clone full-stack my-team
openpawl crew edit my-team             # opens manifest.yaml in $EDITOR
openpawl crew validate my-team         # check before running
```

CLI surface:

| Command | Description |
|---------|-------------|
| `crew list` | List built-in + user crews |
| `crew show <name>` | Print manifest YAML and agent prompts |
| `crew create <name>` | Interactive crew creation |
| `crew edit <name>` | Open manifest in `$EDITOR` |
| `crew clone <built-in> <new>` | Fork a bundled preset |
| `crew validate <name>` | Validate manifest |
| `crew delete <name>` | Remove a user crew (built-ins are protected) |
| `crew run <name> <goal>` | Start a crew run with the named preset (non-interactive) |

Inside a crew run, `/pause`, `/continue`, `/skip <id>`, `/reorder`, `/abort` operate on the live phase loop. See [docs/CREW.md](./docs/CREW.md) for the full guide and [docs/design/crew-v0.4.md](./docs/design/crew-v0.4.md) for the design spec.

## Team Templates

Pre-built teams you can install and use immediately:

```bash
openpawl templates browse              # list available templates
openpawl templates install indie-hacker # install a template
openpawl templates list                # show what's installed
```

Once installed, switch to a template via `/team` inside the TUI. Crew presets live under a separate surface — see [Crew Mode](#crew-mode).

| Template | Pipeline |
|----------|----------|
| `content-creator` | Research, Script, SEO, Review |
| `indie-hacker` | Architect, Engineer, QA, RFC |
| `research-intelligence` | Research, Verify, Synthesize |
| `business-ops` | Process, Automate, Document |
| `full-stack-sprint` | Frontend, Backend, DevOps, Lead |

Five seed templates ship offline. Community templates at [openpawl-templates](https://github.com/codepawl/openpawl-templates).

## CLI Reference

**Getting started:**

| Command | Description |
|---------|-------------|
| `setup` | Guided setup wizard |
| `check` | Verify setup is working |
| `demo` | Demo mode — see OpenPawl in action (no API key needed) |

**Daily workflow:**

| Command | Description |
|---------|-------------|
| _(bare)_ `openpawl` | Launch interactive TUI (solo by default; `--mode crew` to start in crew) |
| `solo` / `chat` | Aliases for the bare TUI launch |
| `-p "<prompt>"` | Non-interactive print mode; add `--mode crew [--crew <name>] [--workdir <path>]`. Global flags: `--provider <name>`, `--model <name>`, `--mock-llm` |
| `standup` | Daily standup summary |
| `think` | Rubber duck mode — structured debate |
| `clarity` | Check goal clarity |

**Team and providers:**

| Command | Description |
|---------|-------------|
| `templates` | Browse, install, and manage team templates |
| `model` | LLM selection: list, set, per-agent overrides |
| `providers` | Configure and test LLM providers |
| `agent` | Add and manage custom agents |
| `crew` | Manage crews — list, show, create, edit, delete, validate, clone |
| `settings` | View and change settings |
| `config` | Configuration management (get/set/unset) |

**Memory and decisions:**

| Command | Description |
|---------|-------------|
| `journal` | Decision journal: list, search, show, export |
| `drift` | Detect goal vs decision conflicts |
| `lessons` | Export lessons learned |
| `handoff` | Generate or import CONTEXT.md |
| `memory` | Global memory: health, promote, export |

**History and analysis:**

| Command | Description |
|---------|-------------|
| `replay` | Replay past sessions for debugging |
| `audit` | Export audit trail |
| `heatmap` | Agent utilization heatmap |
| `forecast` | Estimate run cost before execution |
| `diff` | Compare runs within or across sessions |
| `score` | Vibe coding score and trends |
| `profile` | Agent performance profiles |
| `sessions` | Session management |

**Utilities:**

| Command | Description |
|---------|-------------|
| `cache` | Response cache management |
| `logs` | View session and gateway logs |
| `clean` | Remove session data (preserves memory) |
| `update` | Self-update to latest version |

**TUI slash commands** (inside the interactive app):

| Command | Description |
|---------|-------------|
| `/help` | Show all registered slash commands |
| `/clear` | Clear the message stream |
| `/quit` | Exit the TUI |
| `/mode [solo\|crew]` | Switch mode or cycle to the next |
| `/sessions` | Browse past sessions and resume one |
| `/model` | Show or switch the active model |
| `/team` | Browse and switch team templates |
| `/agents` | List and configure agents (CRUD) |
| `/settings` | App settings |
| `/status` | Provider and system status |
| `/setup` | Re-run setup wizard |
| `/hotkeys` | View and customize keybindings |
| `/keybindings` | Open the keybindings config file |
| `/theme` | Pick a TUI theme |
| `/debate` | Multi-perspective analysis |
| `/research` | Deep research mode |
| `/compact` | Toggle compact/expanded view |
| `/plan` | Ask the agent to plan before executing |
| `/workspace` | Manage workspace-local configuration |
| `/error` | Show technical details for last error |
| `/dev` | Toggle dev mode (performance overlay + logging) |

Inside an active crew run, the runtime checkpoint controls become available:

| Command | Description |
|---------|-------------|
| `/crew` | Print live crew status (phases, tasks, tokens) |
| `/pause` | Pause the crew run at the next safe point |
| `/continue` | Resume a paused run |
| `/skip <id>` | Skip a queued task |
| `/reorder` | Reorder upcoming phases interactively |
| `/abort` | Abort the run, preserving artifacts |
| `/adjust` | Edit the goal mid-run (re-anchor) |

## Architecture

```mermaid
graph TD
    U[User Prompt] --> R[Prompt Router]
    R -->|solo| A1[Single Agent + Tools]
    R -->|crew| PL[Planner]
    PL --> PHX[Phase Executor<br/>tier-gated, parallel]
    PHX --> DS{Drift Supervisor}
    DS -->|conflict| ABORT[Halt + report]
    DS -->|ok| MTG[Discussion Meeting<br/>before tier 3]
    MTG --> PHX
    PHX -->|all phases done| CMP[Compaction + Hebbian inject]
    A1 --> LLM[LLM Multi-Turn Loop]
    CMP --> LLM
    LLM --> TC[Tool Calls]
    TC -->|file_write/edit| DIFF[Inline Diff]
    TC -->|shell_exec| SH[Shell]
    TC -->|web_search| WS[Web]
    LLM --> MS[(LanceDB + Hebbian)]
    MS -->|next run| LLM
```

Solo mode dispatches a single agent through an LLM multi-turn loop with native tool calling. Crew mode runs a graph: planner → tier-gated phase executor with drift gating → discussion meeting before tier 3 → compaction + Hebbian injection on completion — see [docs/CREW.md](./docs/CREW.md) for the runtime, [docs/design/crew-v0.4.md](./docs/design/crew-v0.4.md) for the design spec. Memory: LanceDB vector store + Hebbian associative layer carries patterns and lessons across runs. Context compression keeps long conversations within token limits.

Beyond the runtime, OpenPawl ships cross-session subsystems that carry state between runs: `src/journal/` (decision journal with supersession), `src/drift/` (goal–decision conflict detection), `src/briefing/` (session "previously on…"), `src/handoff/` (CONTEXT.md generation), and `src/think/` + `src/debate/` (multi-perspective reasoning). These feed into and out of the same LanceDB + Hebbian memory store.

## Comparison

| Feature | OpenPawl | Claude Code | OpenCode | Aider |
|---------|----------|-------------|----------|-------|
| Multi-agent orchestration | Crew mode + solo | Single agent | Single agent | Single agent |
| Cross-session memory | LanceDB vector + hebbian | Per-project CLAUDE.md | None | Git-based |
| Post-mortem learning | Extracts & injects lessons | None | None | None |
| Team templates | 5 built-in + custom | None | None | None |
| Inline file diffs | Colored unified diffs | Built-in | None | Git diff |
| Decision journal | Searchable, drift detection | None | None | None |
| Cost forecasting | 3 methods + learning curves | None | None | None |
| Interactive TUI | Custom (Catppuccin, mouse) | Built-in | Bubbletea | Terminal |
| Non-interactive mode | `-p` print mode + `crew run` subcommand | `claude -p` | CLI only | CLI only |
| Agent heatmap | Utilization + bottleneck | None | None | None |

OpenPawl focuses on multi-agent workflows and persistent learning. For single-agent coding tasks, Claude Code and Aider are more mature. For a detailed feature comparison, see [docs/comparison.md](./docs/comparison.md).

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js >= 20, Bun |
| Terminal UI | Custom TUI engine; themes: Catppuccin (Mocha/Latte/Frappe/Macchiato), Nord, Gruvbox (Dark/Light), Rose Pine, Tokyo Night (+ Storm), High Contrast |
| LLM engine | Native API tool calling, multi-turn streaming |
| LLM providers | OAuth: ChatGPT, GitHub Copilot, Gemini · API key: Anthropic, OpenAI, OpenRouter, DeepSeek, Groq, Mistral, xAI, Cerebras, Together, Fireworks, Moonshot, Z.AI, MiniMax, Cohere, Perplexity · Cloud: AWS Bedrock, Vertex AI, Azure OpenAI · Local: Ollama, LM Studio · plus custom OpenAI-compatible endpoint |
| Vector memory | LanceDB (embedded) |
| Diff engine | LCS-based line diff (no external deps) |
| Validation | Zod |
| Error handling | `neverthrow` Result types (no thrown exceptions across boundaries) |
| Build | tsup + Vite (web client) |
| Web dashboard | React 19 + ReactFlow + Tailwind + Zustand (under `src/web/client/`, separate workspace) |
| Tests | Bun test runner |
| JSON parsing | Safe JSON parser with recovery |

Pure TypeScript (ESM). No Python. See the badges at the top of this page for current test count and source size.

## Development

```bash
bun install          # install dependencies
bun run dev          # watch mode
bun run build        # production build (tsup + web client)
bun run typecheck    # type-check (tsc --noEmit)
bun run test         # run tests (bun test)
bun run lint         # lint (eslint src/)
```

Pre-commit hook runs typecheck → lint → tests automatically.

## Security

- Config at `~/.openpawl/config.json` may contain API tokens
- Agent output is untrusted — review before applying to production
- Global memory at `~/.openpawl/memory/global.db` — back it up

See [SECURITY.md](./SECURITY.md) for vulnerability reporting.

## Documentation

| Document | Contents |
|----------|----------|
| [AGENTS.md](./docs/AGENTS.md) | Team culture and RFC policy |
| [WEBHOOKS.md](./docs/WEBHOOKS.md) | Webhook event schemas |
| [comparison.md](./docs/comparison.md) | Feature comparison with other tools |

## License

[MIT](./LICENSE)
