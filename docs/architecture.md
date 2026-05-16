# OpenPawl Architecture Reference

## When to use
When modifying OpenPawl internals, understanding data flow, or
debugging cross-module issues.

## Unified Data Flow

OpenPawl runs a single execution path. The legacy "solo / collab /
sprint" branches were removed in the v0.4 refactor — every prompt now
goes through the orchestrator dispatcher.

```
TUI editor (or `openpawl -p` headless)
    │
    ▼
src/app/input-handler.ts          ─── parses /commands, @mentions, !shell
    │
    ▼
src/app/prompt-handler.ts         ─── autoCompactIfNeeded at ≥70%
    │                                  context utilization, then dispatch
    ▼
src/router/prompt-router.ts:route ─── slash commands, mention parsing,
    │                                  intent classification, dispatch
    ▼
src/orchestrator/dispatcher.ts    ─── registry.all() → similarityTopK
    │                                  (embedder + Jaccard fallback) →
    │                                  spawn matched subagents in parallel
    ▼
src/orchestrator/subagent-runner.ts ─ depth gate, token budget, capability
    │                                  gate, write-lock acquisition
    ▼
src/router/agent-turn.ts          ─── LLM call loop with tool execution
    │
    ▼
result.summary → AgentResult → DispatchResult → chat stream
```

Compaction runs at two trigger points: the explicit `/compact`
slash command, and the pre-dispatch auto-trigger in
`prompt-handler.handleWithRouter` when the
`ContextTracker.snapshot().utilizationPercent` crosses 70%. Both paths
render the same op:compact branded summary (`src/tui/components/compact-summary.ts`).

## Agent Registry

Agents are markdown files loaded from three locations with later-wins
precedence:

1. `./agents/*.md`              — project-local
2. `~/.openpawl/agents/*.md`    — user-installed
3. `src/agents/builtin/*.md`    — ships with the binary

Frontmatter schema (zod-validated at load time):

```yaml
---
name: kebab-case-id
description: one-line summary used by the dispatcher for similarity match
model: claude-opus-4-7        # optional
tools:                         # optional; otherwise empty allow-list
  allow: [Read, Edit, Bash]
  deny:  [Write]
triggers:                       # optional; raises keyword-fallback score
  - plan
  - "how should"
---

You are the X. ...             # markdown body = system prompt
```

Loader: `src/agents/registry/markdown-loader.ts`.
Registry assembly: `src/agents/registry/markdown-registry.ts`.

## Specs and Plans `[v0.4.x]`

The spec/plan file system is the v0.4.x roadmap surface. Convention
(not yet wired into the dispatcher):

- `./specs/<slug>.md`  — user-editable feature spec, git-tracked
- `./plans/<slug>.md`  — generated implementation plan, git-tracked

A future commit wires the spec/plan flow into the orchestrator so
multi-file goals route through a `spec → plan → execute → review`
sequence with a drift checkpoint between phases.

## Key Patterns

### Safe JSON Parsing
Always use `safeJsonParse()` for LLM output:
```typescript
import { safeJsonParse } from "../utils/safe-json-parse.js";
const result = safeJsonParse<TaskList>(llmOutput);
if (!result.parsed) { /* handle gracefully */ }
```

### Event System
Use typed enums from `event-types.ts`:
```typescript
router.on(RouterEvent.AgentStart, handler);
toolExec.on(ToolEvent.ConfirmationNeeded, handler);
```
Never use string literals for events.

### Debug Logging
```typescript
import { debugLog } from "../debug/logger.js";
debugLog("info", "orchestrator", "subagent_spawned", { data: { ... } });
```
No-op when `OPENPAWL_DEBUG` is not set.

### Tool Results with Diff
`Write` / `Edit` / file write tools return diff data.
Use `formatToolResult()` to display, never `JSON.stringify`.

## Common Pitfalls

- Status bar not updating: check event emitter instance match.
- Session blank on load: check message replay in `session-helpers.ts`.
- Token counter not showing: check `dispatch:done` handler chain in
  `router-wiring.ts`.
- Diff showing raw JSON: `formatToolResult` not called.
- Config not syncing: use `writeGlobalConfig` + emit change event.
- Builtin agents missing in dist: `tsup.config.ts` must copy
  `src/agents/builtin/*.md` to `dist/agents/builtin/`.
