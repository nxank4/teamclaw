# Retry Root-Cause Analysis

Two nested retry loops compound on environmental failures: the LLM keeps spending turns trying variants of a failing shell command (model-level), and the sprint runner re-runs the whole task once the LLM gives up (sprint-level). Both mechanisms treat "the env is broken" the same as "the agent picked a wrong approach," so neither exit. This doc diagnoses each loop and proposes structural fixes.

## Executive summary

- **Model-level retry is emergent, not configured.** `callLLMMultiTurn` loops while the model emits tool calls; nothing inspects tool exit codes. Agent system prompts contain zero guidance about escalating on env errors. The doom-loop detector catches only identical calls, so an agent rotating `npm install` → `yarn install` → `pnpm install` sails through.
- **Sprint-level retry is oblivious to error class.** Any `failed` / `incomplete` task that doesn't match three narrow exclusions (`timeout`, `Skipped:`, `aborted`) is retried once with the same agent in the same environment — only the description gets an appended hint. A post-hoc classifier that *does* understand env errors (`post-mortem.ts`) runs too late to influence retry.
- **No status exists for "blocked by environment."** The task state union is `pending | in_progress | completed | failed | incomplete`. Adding `blocked` plus a shared error classifier lets both layers short-circuit on env failures and reports them honestly as partial, not failed.

## Log note

The referenced log `benchmarks/debug-reruns/2026-04-17/cli-task-manager-sprint-post-fix1.jsonl` is not present in the working tree (no `benchmarks/` directory on `staging` at the time of writing, even though the structured JSONL logging feature landed via #71). The "count turns spent on npm install" verification could not be performed against the actual trace. Structural findings below are drawn from the code and are independent of that count. The expected pattern for that run, given the mechanisms described here, is: coder burns up to ~10 tool turns cycling through install commands, LLM loop exits (tool turns exhausted), validation marks the task `incomplete` (no write happened), sprint retries once with the same agent against the same env, burns ~10 more turns, and finally surfaces as a task failure with no indication that the root cause was environmental.

---

## Part A — Model-level retry (LLM turn loop)

### Evidence

**Loop control — `src/engine/llm.ts:384-469`**

```ts
for (let turn = 0; turn < maxTurns; turn++) {
  ...
  if (response.toolCalls.length === 0) {
    // No tool calls → model is done
    return { text: response.text, toolCalls: allToolCalls, usage: totalUsage };
  }
  ...
  // Execute tool calls, push results as messages, continue
}
// Hit max turns — return last response
```

The loop terminates only on (a) no tool calls emitted (line 427), (b) abort signal (line 385), or (c) `maxTurns` exhausted. Tool errors are pushed to `messages` as `{ role: "tool", content: result }` strings; the loop does not inspect `result` for failure signals.

**maxTurns configuration**
- Default: `src/engine/llm.ts:375` — `const maxTurns = opts.maxTurns ?? 20;`
- Sprint override: `src/sprint/create-sprint-runner.ts:118` — `maxTurns: 10`
- Chat (with tools): `src/router/llm-agent-runner.ts:249` — `maxTurns: 10`
- Chat (no tools): `src/router/llm-agent-runner.ts:265` — `maxTurns: 1`

**All seven built-in agent system prompts — `src/router/agent-registry.ts:28-126`** (quoted verbatim):

| Agent | Prompt (file:line) |
|---|---|
| Coder | `agent-registry.ts:36` — "Write and modify code. Use tools to read files before editing. Output working code, not explanations about code." |
| Reviewer | `agent-registry.ts:51` — "Review code. Read the actual files before commenting. Report issues with file:line references. Skip praise." |
| Planner | `agent-registry.ts:65` — "Break goals into concrete steps. Each step: what to do, which files, expected outcome. No philosophy." |
| Tester | `agent-registry.ts:79` — "Write test code. Read the source first to understand what to test. Show test code, not test philosophy." |
| Debugger | `agent-registry.ts:93` — "Debug by reading the actual error and source code. Trace the root cause. Fix it or explain exactly what's wrong." |
| Researcher | `agent-registry.ts:107` — "Search and fetch information. Return facts, not summaries of your search process." |
| Assistant | `agent-registry.ts:121` — "Answer directly. If a tool would help, use it. If not, give the shortest correct answer." |

Identity prefix at `agent-registry.ts:24` adds only: "RULES: No emojis. No bullet suggestions. No "Would you like..." questions. Be terse. Stop when done."

**None of these address persistence, escalation, or env errors.** "Stop when done" is the closest thing — silent about what "done" means when the tool keeps failing. The model's default behavior on an error-shaped tool result is to try again with a perturbation, and no prompt tells it otherwise.

**Doom-loop detector — `src/context/doom-loop-detector.ts:23-26`**

```ts
fingerprint(toolName: string, params: Record<string, unknown>): string {
  const sorted = JSON.stringify(params, Object.keys(params).sort());
  return createHash("md5").update(`${toolName}:${sorted}`).digest("hex");
}
```

Hashes `(toolName, sorted-params)`. `countConsecutiveTail` (lines 112-122) counts only the run at the tail of the window. Blocks at 4 consecutive identical calls; warns at 3 (`WARN_THRESHOLD`/`BLOCK_THRESHOLD`, lines 13-14).

Consequence: `shell_exec("npm install")` → `shell_exec("yarn install")` → `shell_exec("pnpm install")` produce three different hashes and never trip the detector. The coder can work through the full set of package managers and cache-clean flags without intervention.

### Ranked fixes

1. **Add an escalation clause to the tool-using agents' system prompts** (coder, tester, debugger, assistant). Something like: *"If a `shell_exec` call returns exit 127 or 'command not found', the environment is missing a dependency. Do not retry with a different package manager or path. Stop and end your response with a single line: `BLOCKED: <what is missing>`."* The sprint runner can then detect `BLOCKED:` and short-circuit (ties to Part B).
2. **Generalize doom-loop detection from "identical params" to "repeated failure signature."** Fingerprint by `(toolName, exit_code, first-N-chars-of-stderr)` rather than params. Then a run of exit-127s across different commands is caught even when the arguments differ. Keep the existing param-identical detector as a second signal.
3. **Return structured tool results for `shell_exec`** — a JSON-shaped `{ exit_code, stdout_head, stderr_head }` instead of the current freeform string. Gives both the model and the detector something reliable to key off of. Purely additive; existing formatting can stay.

Fix 1 is the lowest-risk and highest-leverage. Fixes 2 and 3 are structural and pay off across future agents too.

---

## Part B — Sprint-level retry (whole-task re-run)

### Evidence

**Task state union — `src/sprint/types.ts:8`**

```ts
status: "pending" | "in_progress" | "completed" | "failed" | "incomplete";
```

No `blocked`, no distinction between "agent couldn't complete the work" and "environment prevented the work."

**Validation — `src/sprint/sprint-runner.ts:498-510`**

```ts
if (this.taskExpectsWrite(task) && !this.taskDidWrite(task)) {
  task.status = "incomplete";
  task.error = "Task expects file creation/modification but agent only performed read operations";
  this.state.failedTasks++;
} else {
  task.status = "completed";
  this.state.completedTasks++;
}
} catch (err) {
  task.status = "failed";
  task.error = err instanceof Error ? err.message : String(err);
  this.state.failedTasks++;
}
```

`taskExpectsWrite` keys off keywords in the description (`sprint-runner.ts:115`: `"create", "build", "implement", "write", "add", "generate", "set up", "setup", "configure", "install"`). `taskDidWrite` counts `file_write`/`file_edit`/`shell_exec` in `toolsCalled` (`sprint-runner.ts:117`). The install-keyword path is particularly brittle: a task that says "install dependencies" and calls `shell_exec("npm install")` ten times, all failing exit 127, counts as a *write* (shell_exec was called) — so it becomes `completed`, not `incomplete`. If the task description says "install dependencies and configure" but the agent wrote no files, it becomes `incomplete` and retries. Both paths are wrong.

**Retry trigger (sequential) — `sprint-runner.ts:368-370`**

```ts
if ((task.status === "failed" || task.status === "incomplete") && this.isRetriable(task)) {
  await this.retryTask(task, i);
}
```

**Retry trigger (parallel) — `sprint-runner.ts:445-453`** — same predicate, applied to the batch after completion.

**Retry gating — `sprint-runner.ts:515-519`**

```ts
private isRetriable(task: SprintTask): boolean {
  const err = task.error ?? "";
  return !err.includes("timeout") && !err.includes("Timed out")
    && !err.includes("Skipped:") && !err.includes("aborted");
}
```

Three exclusions, all about process-level abandonment. Env-error strings like "exit 127", "command not found", "ENOENT: no such file", "EACCES" are not excluded — they retry.

**What changes between retry and original — `sprint-runner.ts:522-555`**

```ts
private async retryTask(task: SprintTask, index: number): Promise<void> {
  const origError = task.error ?? "unknown";
  const origDesc = task.description;

  task.status = "pending";
  task.error = undefined;
  task.result = undefined;
  task.toolsCalled = [];
  this.state.failedTasks--;
  ...
  task.description = origDesc +
    `\n\n[RETRY — previous attempt failed: ${origError.slice(0, 150)}. Try a different approach.]`;

  await this.executeTask(task, index);
```

Same agent, same tools, same working directory, same environment. Only the description gets an appended error snippet (first 150 chars). For an env error, "try a different approach" is bad advice — there is no different approach available to the agent.

**Classifier exists but runs after retry — `src/sprint/post-mortem.ts:25-71`**

The `FAILURE_RULES` array already knows about every env-error signature relevant here:

```ts
{ pattern: /module\s+not\s+found|cannot\s+find\s+module|no\s+such\s+file|ENOENT/i, ... }
{ pattern: /command\s+not\s+found|not\s+recognized|ENOENT.*bin/i, ... }
{ pattern: /permission\s+denied|EACCES|forbidden/i, ... }
{ pattern: /port\s+.*in\s+use|EADDRINUSE|already\s+listening/i, ... }
```

But `classifyFailure` (`post-mortem.ts:73-83`) is only called from `analyzeRunResult` (for end-of-sprint lessons), never from `isRetriable` / `executeTask`. The knowledge exists; it just isn't wired into the retry decision.

### Ranked fixes

1. **Extract an `error-classify.ts` module** that turns `task.error + task.result` into a tagged union like `{ kind: "env_missing_dep" | "env_perm" | "timeout" | "agent_logic" | "unknown", signal?: string }`. Used by `isRetriable` (Part B), by the new `blocked` status assignment (Part C), and by `post-mortem.ts` (so rules aren't duplicated). This is the single highest-leverage change in the whole analysis.
2. **Teach `isRetriable` about env errors.** If the classifier returns `env_missing_dep` / `env_perm` / `env_port_in_use`, return `false` *and* set `task.status = "blocked"` (Part C) with the extracted signal as `task.error`. Retry only for `agent_logic` and `unknown`.
3. **On retry, optionally swap agent.** If the original run was `coder` and the error is diagnostic-looking ("TypeError: X is not a function", stack trace), retry with `debugger`. Only sensible once (1) and (2) filter out the env-error noise; otherwise we just burn debugger turns on `npm install`.

Fixes 1 and 2 together completely eliminate the post-fix log's pathological pattern.

---

## Part C — `blocked` task status

### Semantics

- `blocked` means: agent ran, surfaced an error that the classifier recognized as environmental, and the runner determined no retry in the same env would help.
- A `blocked` task is **not** a sprint failure. A sprint with N completed + M blocked + 0 failed should report as "partial — N/N+M completed, M blocked on environment."
- `blocked` tasks do **not** retry. They are terminal within the run.
- Downstream tasks treat a `blocked` dependency the same way they currently treat a `failed`-with-no-output dependency: skip (already the right behavior).

### Touchpoints

Concrete files/lines that read or write the status union today and would need updates:

| File:line | What | Change |
|---|---|---|
| `src/sprint/types.ts:8` | Status union | Add `"blocked"` |
| `src/sprint/types.ts:20-30` | `SprintState` counters | Add `blockedTasks: number` |
| `src/sprint/sprint-runner.ts:115` | `WRITE_INTENT_KEYWORDS` | No change — but the install-intent heuristic needs revisiting; env errors should override the write check |
| `src/sprint/sprint-runner.ts:355-362` | Skipped-due-to-failed-dep branch | Consider whether to skip on blocked deps or attempt; current "no output" check already degrades gracefully |
| `src/sprint/sprint-runner.ts:368` | Sequential retry gate | Skip if `task.status === "blocked"` (handled naturally once classifier returns `blocked` instead of `failed`/`incomplete`) |
| `src/sprint/sprint-runner.ts:390,411` | Parallel dep-ready gate `status !== "pending"` | No change — `blocked` is correctly non-pending |
| `src/sprint/sprint-runner.ts:437-441` | Parallel completion bookkeeping | Add a `blocked` set alongside `completed`/`failed`, so downstream readiness logic distinguishes |
| `src/sprint/sprint-runner.ts:445` | Parallel retry gate | Same as sequential — skip `blocked` |
| `src/sprint/sprint-runner.ts:498-510` | Validation block | Call the classifier; if env-error detected, set `blocked` before the write-check fallthrough |
| `src/sprint/post-mortem.ts:73-83,~108,~136` | `classifyFailure` / `analyzeRunResult` | Source the regex from the new shared module; treat `blocked` separately from `failed` in lesson extraction |
| TUI task-list rendering | `grep -rn '"failed"\|"incomplete"' src/tui src/app` | Add a `blocked` color/icon (Catppuccin palette — likely `peach` or `yellow`) |
| Session persistence | Any serialization that enumerates statuses | `blocked` will round-trip as a string; check that no switch is exhaustive-matching without a default |

### Migration notes

- Backward-compatible on disk: old sessions won't contain `blocked`, so no migration needed.
- Any `exhaustive-switch` patterns in TypeScript (with `never` fallthrough) will surface at compile time when `blocked` is added — that's the intended way to find remaining touchpoints. Run `bun run typecheck` after adding to the union.
- Post-mortem lesson selection: a run with only `blocked` tasks should generate *operator-facing* lessons ("project requires Node ≥ 20, install nvm first") rather than *agent-facing* ones ("break this task into smaller chunks"). Worth a separate pass in `post-mortem.ts`.

---

## Appendix — referenced code locations

- `src/engine/llm.ts:375` — `maxTurns` default
- `src/engine/llm.ts:384-469` — `callLLMMultiTurn` loop body
- `src/router/agent-registry.ts:18-26` — identity prefix
- `src/router/agent-registry.ts:28-126` — built-in agent definitions
- `src/router/llm-agent-runner.ts:249,265` — chat-mode `maxTurns`
- `src/context/doom-loop-detector.ts:12-14` — thresholds
- `src/context/doom-loop-detector.ts:23-26` — fingerprint
- `src/context/doom-loop-detector.ts:112-122` — tail-run counting
- `src/sprint/create-sprint-runner.ts:118` — sprint `maxTurns`
- `src/sprint/types.ts:5-16` — `SprintTask`
- `src/sprint/types.ts:20-30` — `SprintState`
- `src/sprint/sprint-runner.ts:115-117` — write-intent heuristic
- `src/sprint/sprint-runner.ts:355-362` — skip-on-dep-failure
- `src/sprint/sprint-runner.ts:365-370` — sequential executeTask + retry
- `src/sprint/sprint-runner.ts:376-454` — parallel executor
- `src/sprint/sprint-runner.ts:445-453` — parallel retry
- `src/sprint/sprint-runner.ts:498-510` — validation block
- `src/sprint/sprint-runner.ts:515-519` — `isRetriable`
- `src/sprint/sprint-runner.ts:522-555` — `retryTask`
- `src/sprint/post-mortem.ts:25-71` — `FAILURE_RULES`
- `src/sprint/post-mortem.ts:73-83` — `classifyFailure`
