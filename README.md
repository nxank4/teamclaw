<p align="center">
  <img src="./assets/logo.svg" width="120" alt="OpenPawl" />
</p>

# OpenPawl

**A TypeScript-native coding agent workspace. Persistent learning memory, drift detection, decision journaling — built in, not bolted on.**

[![CI](https://github.com/codepawl/openpawl/actions/workflows/ci.yml/badge.svg)](https://github.com/codepawl/openpawl/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js >= 20](https://img.shields.io/badge/Node.js-%3E%3D%2020-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

OpenPawl is a coding agent that lives in your terminal and *remembers*. A markdown-driven agent registry picks the right specialist for each prompt. A LanceDB-backed memory store carries successful patterns and post-mortem lessons across sessions. A decision journal tracks the architectural choices you make, and a drift supervisor flags when later work contradicts earlier intent.

## Quickstart

```bash
# Install
npm install -g @codepawl/openpawl
# or: bun add -g @codepawl/openpawl

# First-run setup wizard
openpawl setup

# Interactive TUI
openpawl

# Headless ("what Claude Code's -p does"): print a response, exit
openpawl -p "Add rate limiting to the auth handler"
```

**Requirements:** Node.js ≥ 20, Bun, and an LLM API key (Anthropic, OpenAI, OpenRouter, DeepSeek, Groq, or local Ollama).

## How OpenPawl differs

OpenPawl runs a single execution path — every prompt goes through the orchestrator dispatcher. The differentiators are the things bolted *around* that loop:

- **Markdown agent registry** — agents live as `*.md` files with YAML frontmatter. Drop a file into `./agents/` (project-local), `~/.openpawl/agents/` (user-installed), or rely on the five built-in specialists. The dispatcher matches the incoming task against agent descriptions via embedding similarity, with a keyword fallback when no embedder is reachable.
- **Hebbian + vector memory** — successful patterns are written to LanceDB and re-retrieved by next run. Co-activated concepts strengthen their associations Hebbian-style, so memory gets sharper with use.
- **Drift detection** — flags new goals that contradict past decisions, before you've spent tokens on the wrong path.
- **Decision journal** — every architectural choice the agent makes is journaled and searchable. Supersession is tracked, so you can read both the choice and the reason it was overridden later.
- **`/compact` with branded display** — manual or auto at 70% context utilization. Renders a box-drawing summary tagged `op:compact` in the chat stream; Ctrl+O or Ctrl+E expands the per-event detail.
- **Spec / plan files `[v0.4.x]`** — `./specs/<slug>.md` and `./plans/<slug>.md` are first-class, git-tracked artefacts of multi-file work. The flow that wires them into the dispatcher ships in v0.4.x.

## Built-in agents

The orchestrator dispatcher resolves each prompt to one or more of these specialists based on the task description.

| Agent | Choose when |
|-------|-------------|
| `architect`       | Planning architecture, picking patterns, mapping data flow, comparing trade-offs before code is written |
| `builder`         | Code changes, new features, refactors, bug fixes, hands-on work in the workspace |
| `reviewer`        | Reviewing, auditing, critiquing existing code without modifying it |
| `tester`          | Writing tests, running the suite, debugging failing tests, increasing coverage |
| `drift-supervisor`| Detecting scope creep, auditing alignment between stated goal and recent actions |

Custom agents are just markdown files. Drop one in `./agents/`:

```markdown
---
name: docs-writer
description: Writes user-facing documentation. Choose when the task is about explaining APIs, drafting READMEs, or filling in inline docs.
model: claude-opus-4-7
tools:
  allow: [Read, Edit, Write, Grep]
triggers: [docs, document, readme, explain, api reference]
---

You are the Docs Writer. Map the audience first, then the structure...
```

Frontmatter is zod-validated at load time. Project-local agents beat user-installed; user-installed beat built-in.

## Terminal UI

- **Rich TUI** — keyboard navigation, Catppuccin Mocha theme, mouse support
- **Escape to cancel** — stop any streaming response mid-flight
- **Token counter** — live input/output token tracking in the status bar
- **`/compact`** — manual compaction with the op:compact branded summary, auto-trigger at 70% utilization, Ctrl+O / Ctrl+E to expand inline
- **Type-to-filter** — filter in all list views (agents, sessions)
- **Centralized keybindings** — view and customize via `/hotkeys`

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
| _(bare)_ `openpawl` | Launch the interactive TUI |
| `chat` | Alias for the bare TUI launch |
| `-p "<prompt>"` | Headless print mode. Global flags: `--provider <name>`, `--model <name>`, `--mock-llm` |
| `standup` | Daily standup summary |
| `think` | Rubber duck mode — structured debate |
| `clarity` | Check goal clarity |

**Configuration:**

| Command | Description |
|---------|-------------|
| `model` | LLM selection: list, set, per-agent overrides |
| `providers` | Configure and test LLM providers |
| `agent` | Add and manage custom agents |
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
| `/sessions` | Browse past sessions and resume one |
| `/model` | Show or switch the active model |
| `/agents` | List and configure agents (CRUD) |
| `/compact` | Show context state and run compaction (also auto-triggers at 70%) |
| `/settings` | App settings |
| `/status` | Provider and system status |
| `/setup` | Re-run setup wizard |
| `/hotkeys` | View and customize keybindings |
| `/theme` | Pick a TUI theme |
| `/debate` | Multi-perspective analysis |
| `/research` | Deep research mode |
| `/plan` | Ask the agent to plan before executing |
| `/workspace` | Manage workspace-local configuration |
| `/error` | Show technical details for last error |
| `/dev` | Toggle dev mode (performance overlay + logging) |

## Architecture

```
TUI editor (or `openpawl -p` headless)
    │
    ▼
prompt-handler          ─── autoCompactIfNeeded at ≥70% context
    │
    ▼
PromptRouter.route      ─── slash, mentions, dispatch
    │
    ▼
orchestrator/dispatcher ─── registry.all() → similarityTopK
    │                       (embedder + Jaccard fallback)
    ▼
subagent-runner         ─── depth gate, capability gate, write-lock,
    │                       token budget, then runAgentTurn → LLM
    ▼
result → AgentResult → DispatchResult → chat stream
```

See [docs/architecture.md](./docs/architecture.md) for the full component map and data-flow diagram.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js ≥ 20, Bun |
| Terminal UI | Custom TUI engine; themes: Catppuccin (Mocha/Latte/Frappe/Macchiato), Nord, Gruvbox (Dark/Light), Rose Pine, Tokyo Night (+ Storm), High Contrast |
| LLM engine | Native API tool calling, multi-turn streaming |
| LLM providers | OAuth: ChatGPT, GitHub Copilot, Gemini · API key: Anthropic, OpenAI, OpenRouter, DeepSeek, Groq, Mistral, xAI, Cerebras, Together, Fireworks, Moonshot, Z.AI, MiniMax, Cohere, Perplexity · Cloud: AWS Bedrock, Vertex AI, Azure OpenAI · Local: Ollama, LM Studio · custom OpenAI-compatible endpoint |
| Vector memory | LanceDB (embedded) |
| Diff engine | LCS-based line diff (no external deps) |
| Validation | Zod |
| Error handling | `neverthrow` Result types |
| Build | tsup + Vite (web client) |
| Tests | Bun test runner |

Pure TypeScript (ESM). No Python.

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

- Config at `~/.openpawl/config.json` may contain API tokens.
- Agent output is untrusted — review before applying to production.
- Global memory at `~/.openpawl/memory/global.db` — back it up.

See [SECURITY.md](./SECURITY.md) for vulnerability reporting.

## Documentation

| Document | Contents |
|----------|----------|
| [docs/architecture.md](./docs/architecture.md) | Unified data flow, agent registry, component map |
| [docs/ui-audit.md](./docs/ui-audit.md) | TUI quality audit skill (categories A–F) |
| [docs/ux-audit.md](./docs/ux-audit.md) | UX journey audit skill |
| [docs/skills/](./docs/skills) | Auto-debug, debug-patterns, test-runner, git-flow |
| [docs/AGENTS.md](./docs/AGENTS.md) | Team culture and RFC policy |
| [docs/comparison.md](./docs/comparison.md) | Feature comparison with other tools |
| [docs/WEBHOOKS.md](./docs/WEBHOOKS.md) | Webhook event schemas |

## License

[MIT](./LICENSE)
