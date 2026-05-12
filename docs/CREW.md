# Crew Mode

Crew mode runs a team of agents on a single goal. A planner decomposes the task, tier-gated phases execute (with parallelism where the dependency graph allows), a discussion meeting fires before tier 3 to surface disagreement, and a drift supervisor halts the run when later phases contradict earlier decisions. Memory carries decisions and lessons forward across runs.

This guide covers what crew is, how to use it, and how to author or fork crews. The design spec lives at [`docs/design/crew-v0.4.md`](./design/crew-v0.4.md) — that document is the source of truth for design decisions; this guide is the user-facing handbook.

---

## Overview

| | Solo | Crew |
|---|---|---|
| Agents | 1 | 2–10 (recommended 3–5) |
| Decomposition | None — agent works directly off the prompt | Planner produces a phase plan with task ids and dependencies |
| Coordination | None | Tier-gated phases, discussion meeting, drift supervisor |
| Best for | Quick edits, focused single-file tasks, conversation | Multi-file features, refactors, anything that benefits from review |

**When to use crew**: the goal touches more than one concern (write code + write tests + review it), or you want a structured planner-then-do flow with checkpoints.

**When to stay solo**: you already know exactly what to change, or you want a chat partner on a single problem.

---

## Quick Start

1. Launch `openpawl`.
2. Press `Shift+Tab` to cycle to crew mode. The status bar shows the active mode.
3. Type a goal: *"Add a `/health` endpoint with tests."*

The planner runs first — you'll see its tool calls in the live tree. Then the phase executor takes over, dispatching agents into tiers. Tool activity for every subagent streams into the same tree, so you can watch the run instead of waiting on a terminal that looks frozen.

After completion, a phase summary lands in the chat: tasks completed, tasks blocked, tasks skipped, and the final artifacts.

---

## Architecture

The crew runtime is a 12-node graph. Full details in [`docs/design/crew-v0.4.md`](./design/crew-v0.4.md). The shapes that matter for the user-facing model:

- **Planner** — Tier 1 (always runs first). Reads the goal + repo context, produces a structured plan: phases, tasks, dependencies, agent assignments, write_scopes.
- **Phase Executor** — runs each phase. Within a phase, tasks with no dependency cycle run in parallel. Each task is dispatched to an agent picked by the planner.
- **Discussion Meeting** — Tier 3 only. Before any high-risk task runs, the agents convene a brief meeting: each surfaces concerns, a facilitator synthesizes a go/adjust/abort decision. Sycophancy guards prevent unanimous-rubber-stamp outcomes from blocking the run.
- **Drift Supervisor** — runs between phases. Compares the in-progress decisions against the goal and the decision journal. If a later phase contradicts an earlier decision, the supervisor halts and surfaces the conflict — you can `/continue` to override or `/abort` to stop.
- **Context Compaction** — once the in-flight context approaches token limits, the runtime compacts older turns. Agents see a summary of what came before, plus the live working set.
- **Hebbian Injection** — at task start, each agent receives a top-K associative memory block: concepts that have co-activated with this task description in past runs.

---

## Built-in Presets

### `full-stack`

Four agents balanced for typical web/app work:

| Agent | Tools | write_scope | Role |
|-------|-------|-------------|------|
| **Planner** | `file_read`, `file_list` | (read-only) | Decomposes the goal, picks the team, writes the phase plan |
| **Coder** | `file_read`, `file_write`, `file_edit`, `file_list`, `shell_exec` | `src/**`, `lib/**` | Writes or edits the code |
| **Reviewer** | `file_read`, `file_list`, `git_ops` | (read-only) | Reads the diff, flags risk, requests changes |
| **Tester** | `file_read`, `file_write`, `file_edit`, `file_list`, `shell_exec` | `tests/**`, `**/*.test.ts` | Writes tests, runs the suite |

Inspect the manifest:

```bash
openpawl crew show full-stack
```

---

## Custom Crews

A crew is a directory under `~/.openpawl/crews/<name>/` with a `manifest.yaml` and one prompt file per agent. The runtime resolves crews in this order:

1. `~/.openpawl/crews/<name>/manifest.yaml` — your crew, takes precedence.
2. Bundled built-in preset (only `full-stack` ships today).

This means cloning a built-in and editing it under your home directory is the supported path for forking. Built-in directories are never mutated.

### Manifest format

```yaml
name: my-team
description: A two-agent crew that pairs an architect with a builder.
version: 1.0.0

constraints:
  min_agents: 2
  max_agents: 10
  recommended_range: [2, 4]
  required_roles: []

agents:
  - id: architect
    name: Architect
    description: Plans the change and reviews the result.
    tools: [file_read, file_list]
    prompt_file: architect.md

  - id: builder
    name: Builder
    description: Implements the plan.
    tools: [file_read, file_write, file_edit, file_list, shell_exec]
    write_scope:
      - "src/**"
      - "lib/**"
    prompt_file: builder.md
    model: default
```

Field notes:

- `id` — must match `^[a-z0-9-]+$`. Used in routing (`@architect` mentions, status-bar labels).
- `tools` — drawn from `file_read`, `file_write`, `file_edit`, `file_list`, `shell_exec`, `web_search`, `web_fetch`, `git_ops`. Tools the agent does not list are unavailable to it at runtime.
- `write_scope` — repo-relative globs. Required when the agent has `file_write` or `file_edit`. The capability gate enforces this at write time — an attempt to write outside the scope is rejected before it touches disk.
- `prompt_file` — relative to the crew dir. Loaded and inlined into the agent's system prompt at runtime.
- `model` — leave unset or set to `"default"` to use the user's active model. Set to a specific model id (e.g. `"claude-opus-4-7"`) to pin one agent.

### Agent prompt file

A plain markdown file. Keep it focused — short prompts beat long ones in tool-using agents.

```markdown
# Architect

You are the Architect on this crew. Your job is to plan changes and review their results.

When the planner hands you a task:
1. Read the relevant code first.
2. Sketch the change as bullet points: what, where, why.
3. Hand it to the Builder.

Do not write code yourself. Your tools are read-only.
```

### Capability gate

The capability gate runs immediately before each tool invocation. For `file_write` / `file_edit`:

- The path must match at least one of the agent's `write_scope` globs.
- The path must not contain `..` and must be repo-relative.

A rejected write surfaces in the agent's tool result as a clear "blocked by capability gate" message — the agent can re-plan and try a different path.

### Token budgets

Each agent inherits a per-task token budget from the manifest's constraints. The runtime enforces an overall run budget too. When an agent burns through its task budget, the runtime stops it mid-stream and surfaces the partial result so the planner can decide whether to retry, skip, or split the task.

---

## Three-Layer Checkpoints

Crew runs surface three checkpoint types. Each pauses the run until you resolve it:

| Layer | When | Resolution |
|-------|------|------------|
| **Plan** | After planner produces the phase plan | `/continue` to accept, `/adjust` to ask the planner to revise, `/abort` to stop |
| **Review** | After each phase completes | `/continue` to advance, `/skip <task-id>` to drop a blocked task, `/reorder <task-ids>` to rearrange the next phase |
| **Drift** | When the supervisor detects a goal contradiction | `/continue` to override (drift halt becomes a warning), `/abort` to stop |

`/pause` is also available — it pauses between tasks, not mid-task. `/continue` resumes.

`/crew` (no args) prints a read-only status snapshot of the active run.

---

## Discussion Meeting (Tier 3)

Before any tier-3 (high-risk) task fires, the runtime convenes a brief meeting:

1. The facilitator (usually the planner) frames the question.
2. Each agent posts one short reflection — what they would do, what concerns them.
3. **Sycophancy guards**: if every agent posts agreement, the facilitator forces one to play devil's advocate. Unanimous rubber-stamp is treated as a non-decision.
4. The facilitator synthesizes: `go`, `adjust`, or `abort`. The synthesis is what reaches the chat.

Meetings are short (a handful of turns) and visible — you can watch the structured exchange in the message stream. They fire automatically based on the task's tier; you don't trigger them manually.

---

## Slash Commands (during a crew run)

| Command | Effect |
|---------|--------|
| `/pause` | Pause between tasks (Layer 3 manual pause) |
| `/continue` (alias `/c`) | Resume from pause / advance phase gate / continue past drift halt |
| `/skip <task-id>` | Force-complete a task. With no id, picks the first in-progress task |
| `/reorder <ids>` | Reorder the next phase's tasks (comma- or space-separated ids) |
| `/abort` | Graceful abort (gate or phase loop) |
| `/adjust` | Only valid during the visibility gate — resolves to `adjust` so the planner replans |
| `/crew` | Read-only status snapshot of the active crew |

These are no-ops outside a crew run — they print a friendly "no active crew" hint instead of throwing.

---

## CLI Commands

`openpawl crew <subcommand>` manages crews from the shell.

| Subcommand | Description |
|------------|-------------|
| `list` | List built-in + user crews |
| `show <name>` | Print manifest YAML and each agent's prompt |
| `create <name>` | Interactive prompt to scaffold a new crew |
| `edit <name>` | Open `manifest.yaml` in `$EDITOR` (`nano` fallback) |
| `delete <name>` | Confirm + remove a user crew. Built-ins are protected |
| `validate <name>` | Load the manifest and report errors / warnings |
| `clone <built-in> <new-name>` | Fork a bundled preset into `~/.openpawl/crews/<new-name>` |

Examples:

```bash
openpawl crew list
openpawl crew show full-stack
openpawl crew clone full-stack my-team
openpawl crew validate my-team
openpawl crew edit my-team
openpawl crew delete my-team
```

---

## Limitations (rc.1)

These are known issues in v0.4.0-rc.1 that don't block the release but are on the post-rc.1 list:

- **Bug U+11**: smaller models (e.g. minimax-m2.7) sometimes still call tools on ambiguous prompts despite the system-prompt rule. Larger models follow the rule reliably.
- **Bug U+6**: session continuity is invisible — the TUI does not show a "resuming session X" signal on launch. The session is correctly resumed; only the visual cue is missing.
- **Bug U+4**: phase-blocked tasks do not yet expose an actionable reason in the message stream. The reason is in the debug log but should surface in chat.
- **Preset clone edge cases**: `crew clone` rewrites the `name` field but does not yet rewrite cross-references inside agent prompt files. If an agent prompt references the original crew name, you'll need to fix that by hand after cloning.

For known issues outside crew, see the [CHANGELOG](../CHANGELOG.md).
