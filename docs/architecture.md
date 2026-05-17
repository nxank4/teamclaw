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

When a user prompt is classified as **complex** on an `idle` session,
the prompt-handler runs an interview-driven authoring flow before
dispatching anything to the agent registry:

```
complex prompt
  → src/spec/codebase-scan.ts    scanForInterview(prompt, root)
                                  - walks the project root (depth 2)
                                  - reads CLAUDE.md, AGENTS.md,
                                    package.json, README.md
                                  - surfaces keyword-matched files
                                  - hard caps: 8k tokens, 5s wall time
  → src/spec/interview.ts        generateInterviewQuestions(...)
                                  - LLM call (user's configured model)
                                  - adaptive 3-15 questions, clamped
                                  - rationale field on each question
  → ask sequentially in chat     src/tui/components/interview-prompt/
                                  - inline branded box, not modal
                                  - 1. / 2. options, "all", "skip",
                                    free-text override
  → src/spec/interview.ts        generateSpecFromAnswers(...)
  → src/spec/slug-gen.ts         generateSlug(prompt) → fallback
                                  to deriveSlug when LLM fails
  → write ./specs/<slug>.md
  → user reviews in their external editor (VS Code, vim, …)
  → /approve → repeat for plan   generatePlanFromAnswers(...)
  → /approve → executing → original prompt dispatched
```

Artefacts on disk:
- `./specs/<slug>.md`  — LLM-drafted feature spec, git-tracked. Body
  follows ## Summary / ## Goals / ## Non-Goals / ## Approach /
  ## Open questions / ## Assumptions. The Assumptions section
  surfaces every interview answer the user `skip`-ped along with the
  default the model applied.
- `./plans/<slug>.md`  — LLM-drafted implementation plan, git-tracked.
  Body follows ## Tasks (checkbox list) / ## Risks / ## Verification.

Slash commands `[v0.4.x]`:
- `/spec <slug>`   — manual file-only path: writes template, leaves
                     review to the user's editor.
- `/plan [<slug>]` — same, linked to the active spec.
- `/approve`       — phase-aware. From `spec_drafting` with interview
                     history, starts the plan interview; otherwise
                     just flips frontmatter draft → approved.
- `/revise [text]` — re-draft from the original interview answers
                     plus new feedback. Inline-arg drafts immediately;
                     no-arg sets `pendingReviseFeedback` and the next
                     turn supplies the feedback.
- `/abandon`       — flip phase to `abandoned` + frontmatter to
                     `abandoned`; clear all pending* fields.

The auto-spec flow lives in `src/app/auto-spec.ts`. AppContext
carries the in-progress interview state across user turns
(`pendingInterview`), the y/n confirmation after a draft
(`pendingPhaseConfirmation`), and the wait state for bare /revise
(`pendingReviseFeedback`). Test seams: `SpecPlanCommandDeps.interviewServices`
overrides each LLM call individually so the suite never hits a
real provider.

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
